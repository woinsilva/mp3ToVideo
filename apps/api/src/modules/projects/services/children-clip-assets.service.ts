import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChildrenClipShotAssetOrigin,
  ChildrenClipShotAssetRole,
  ChildrenClipShotAssetStatus,
  ProcessingJobStatus
} from '@prisma/client';
import { CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME, CHILDREN_CLIP_QUEUE_NAME } from '@video/shared';
import { imageSize } from 'image-size';

import { PrismaService } from '../../../database/prisma.service';
import { ChildrenClipQueueService } from '../../jobs/services/children-clip-queue.service';
import type { GenerateChildrenClipShotAssetDto } from '../dtos/generate-children-clip-shot-asset.dto';
import type { UploadChildrenClipShotAssetDto } from '../dtos/upload-children-clip-shot-asset.dto';
import { LocalStorageService } from './local-storage.service';
import { ChildrenClipStyleProfileService } from './children-clip-style-profile.service';
import { locationWorkflowPhase, selectLocationGenerationTargets } from './children-clip-location-workflow';

@Injectable()
export class ChildrenClipAssetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService,
    @Inject(ChildrenClipStyleProfileService) private readonly styles: ChildrenClipStyleProfileService
  ) {}

  async get(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const jobs = await this.prisma.processingJob.findMany({
      where: { projectId, jobName: CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME },
      orderBy: { createdAt: 'desc' }
    });
    const jobByBullId = new Map(jobs.map((job) => [job.bullJobId, job]));
    const styleLock = project.childrenClipStyleProfile;
    const locations = this.buildLocationWorkflow(project);
    const shots = project.childrenClipShots.map((shot) => ({
      ...shot,
      assets: shot.assets.map((shotAsset) => {
        const job = jobByBullId.get(shotAsset.bullJobId);
        return {
          ...shotAsset,
          asset: shotAsset.asset ? {
            id: shotAsset.asset.id,
            mimeType: shotAsset.asset.mimeType,
            width: shotAsset.asset.width,
            height: shotAsset.asset.height,
            sizeBytes: shotAsset.asset.sizeBytes
          } : null,
          job: job ? {
            status: job.status,
            progress: job.progress,
            detailMessage: job.detailMessage,
            errorMessage: job.errorMessage,
            activityLog: job.activityLog
          } : null,
          styleCompatible: this.isStyleCompatible(shotAsset, styleLock)
        };
      })
    }));
    const approvedBackgrounds = shots.filter((shot) =>
      shot.assets.some((asset) => asset.role === 'background' && asset.status === 'approved' && asset.styleCompatible)
    ).length;
    return {
      styleLock: project.childrenClipStyleProfile,
      locations,
      shots,
      summary: {
        totalShots: shots.length,
        approvedBackgrounds,
        readyForAnimation: shots.length > 0 && approvedBackgrounds === shots.length
      }
    };
  }

  async generateMissingBackgrounds(projectId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertApprovedPlan(project.childrenClipPlan?.status);
    await this.assertLockedStyle(projectId);
    const locations = this.buildLocationWorkflow(project);
    for (const location of locations) {
      await this.enqueueLocationTargets(project, location, projectId, organizationId, userId);
    }
    return this.get(projectId, organizationId);
  }

  async generateLocationBackgrounds(projectId: string, locationId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertApprovedPlan(project.childrenClipPlan?.status);
    await this.assertLockedStyle(projectId);
    const location = this.buildLocationWorkflow(project).find((item) => item.id === locationId);
    if (!location) throw new NotFoundException('Location nao encontrada');
    await this.enqueueLocationTargets(project, location, projectId, organizationId, userId);
    return this.get(projectId, organizationId);
  }

  async generate(
    projectId: string,
    shotId: string,
    organizationId: string,
    userId: string,
    input: GenerateChildrenClipShotAssetDto
  ) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertApprovedPlan(project.childrenClipPlan?.status);
    await this.assertLockedStyle(projectId);
    if (!project.childrenClipShots.some((shot) => shot.id === shotId)) throw new NotFoundException('Tomada nao encontrada');
    if (input.role === 'background') this.assertLocationBackgroundCanProceed(project, shotId);
    await this.createAndEnqueue(projectId, organizationId, userId, shotId, input);
    return this.get(projectId, organizationId);
  }

  async retry(projectId: string, shotAssetId: string, organizationId: string, userId: string) {
    const { project, shotAsset } = await this.getOwnedAsset(projectId, shotAssetId, organizationId);
    this.assertApprovedPlan(project.childrenClipPlan?.status);
    await this.assertLockedStyle(projectId);
    if (shotAsset.origin !== 'generated') throw new BadRequestException('Somente assets gerados podem ser reenfileirados');
    if (shotAsset.status === 'queued' || shotAsset.status === 'generating') {
      throw new BadRequestException('A geracao deste asset ja esta em andamento');
    }
    if (shotAsset.role === 'background') this.assertLocationBackgroundCanProceed(project, shotAsset.shotId);
    await this.enqueueExisting(projectId, organizationId, userId, shotAsset.id);
    return this.get(projectId, organizationId);
  }

  async upload(
    projectId: string,
    shotId: string,
    organizationId: string,
    input: UploadChildrenClipShotAssetDto,
    file: Express.Multer.File
  ) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertApprovedPlan(project.childrenClipPlan?.status);
    if (!project.childrenClipShots.some((shot) => shot.id === shotId)) throw new NotFoundException('Tomada nao encontrada');
    let dimensions: ReturnType<typeof imageSize>;
    try { dimensions = imageSize(new Uint8Array(file.buffer)); }
    catch { throw new BadRequestException('O arquivo enviado nao e uma imagem valida'); }
    if (!dimensions.width || !dimensions.height) throw new BadRequestException('Nao foi possivel determinar as dimensoes da imagem');
    const role = input.role as ChildrenClipShotAssetRole;
    if (role === 'background') this.assertLocationBackgroundCanProceed(project, shotId);
    const characterVersionId = role === 'character_pose' ? input.characterVersionId?.trim() || null : null;
    if (role === 'character_pose') {
      if (!characterVersionId) throw new BadRequestException('Selecione o personagem desta pose');
      const selected = await this.prisma.projectCharacter.findFirst({
        where: { projectId, selectedVersionId: characterVersionId }
      });
      if (!selected) throw new BadRequestException('A pose precisa pertencer a um personagem aprovado deste projeto');
    }
    const versionNumber = await this.nextVersion(shotId, role);
    const record = await this.prisma.childrenClipShotAsset.create({
      data: {
        shotId, role, origin: ChildrenClipShotAssetOrigin.uploaded,
        status: ChildrenClipShotAssetStatus.ready_for_review, versionNumber,
        label: input.label?.trim() || null, characterVersionId, generationEndedAt: new Date()
      }
    });
    const storagePath = await this.storage.saveChildrenClipShotAsset(
      organizationId, projectId, shotId, record.id, role, file.originalname, file.buffer
    );
    const asset = await this.prisma.asset.create({
      data: {
        organizationId, projectId, type: 'image', mimeType: file.mimetype,
        storagePath, sizeBytes: file.size, width: dimensions.width, height: dimensions.height,
        metadata: { source: 'user_upload', shotId, shotAssetId: record.id, role, characterVersionId }
      }
    });
    await this.prisma.childrenClipShotAsset.update({ where: { id: record.id }, data: { assetId: asset.id } });
    return this.get(projectId, organizationId);
  }

  async approve(projectId: string, shotAssetId: string, organizationId: string) {
    const { project, shotAsset } = await this.getOwnedAsset(projectId, shotAssetId, organizationId);
    if (!shotAsset.assetId || !['ready_for_review', 'approved'].includes(shotAsset.status)) {
      throw new BadRequestException('O asset precisa estar pronto para revisao antes da aprovacao');
    }
    const shot = await this.prisma.childrenClipShot.findUnique({
      where: { id: shotAsset.shotId },
      select: { locationId: true, location: { select: { masterBackgroundAssetId: true, masterBackgroundAsset: { select: { childrenClipShotAsset: true } } } } }
    });
    const currentMasterLink = shot?.location?.masterBackgroundAsset?.childrenClipShotAsset;
    const shouldSetLocationMaster = shotAsset.role === 'background' && Boolean(shot?.locationId) && (
      !shot?.location?.masterBackgroundAssetId
      || !currentMasterLink
      || !this.isStyleCompatible(currentMasterLink, project.childrenClipStyleProfile)
      || currentMasterLink.shotId === shotAsset.shotId
    );
    await this.prisma.$transaction([
      this.prisma.childrenClipShotAsset.updateMany({
        where: {
          shotId: shotAsset.shotId,
          role: shotAsset.role,
          characterVersionId: shotAsset.role === 'character_pose' ? shotAsset.characterVersionId : undefined,
          status: 'approved',
          id: { not: shotAsset.id }
        },
        data: { status: 'ready_for_review', approvedAt: null }
      }),
      this.prisma.childrenClipShotAsset.update({
        where: { id: shotAsset.id }, data: { status: 'approved', approvedAt: new Date(), errorMessage: null }
      }),
      ...(shouldSetLocationMaster && shot?.locationId ? [this.prisma.childrenClipLocation.updateMany({
        where: { id: shot.locationId },
        data: { masterBackgroundAssetId: shotAsset.assetId }
      })] : [])
    ]);
    return this.get(projectId, organizationId);
  }

  async reject(projectId: string, shotAssetId: string, organizationId: string) {
    const { shotAsset } = await this.getOwnedAsset(projectId, shotAssetId, organizationId);
    if (shotAsset.status !== 'ready_for_review') {
      throw new BadRequestException('Somente um asset pronto para revisao pode ser rejeitado');
    }
    await this.prisma.childrenClipShotAsset.update({
      where: { id: shotAsset.id }, data: { status: 'rejected', approvedAt: null }
    });
    return this.get(projectId, organizationId);
  }

  async getDownload(projectId: string, shotAssetId: string, organizationId: string) {
    const { shotAsset } = await this.getOwnedAsset(projectId, shotAssetId, organizationId);
    if (!shotAsset.asset) throw new NotFoundException('Arquivo do asset nao encontrado');
    return {
      absolutePath: this.storage.getAbsolutePath(shotAsset.asset.storagePath),
      mimeType: shotAsset.asset.mimeType,
      fileName: `${shotAsset.role}-v${shotAsset.versionNumber}.${shotAsset.asset.mimeType.split('/')[1] ?? 'png'}`
    };
  }

  async refreshStyleLock(projectId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);
    await this.styles.lock(projectId, true);
    return this.get(projectId, organizationId);
  }

  private async createAndEnqueue(
    projectId: string, organizationId: string, userId: string, shotId: string,
    input: GenerateChildrenClipShotAssetDto
  ) {
    const role = input.role as ChildrenClipShotAssetRole;
    const shot = await this.prisma.childrenClipShot.findUnique({ where: { id: shotId } });
    if (!shot) throw new NotFoundException('Tomada nao encontrada');
    const context = await this.prisma.childrenClipShot.findUnique({
      where: { id: shotId },
      include: {
        project: {
          include: {
            childrenClipPlan: true,
            characterLinks: { include: { character: true } }
          }
        }
      }
    });
    if (!context) throw new NotFoundException('Tomada nao encontrada');
    const prompt = input.prompt?.trim() || (role === 'background' ? context.backgroundPrompt : context.description);
    const forbiddenIds = this.stringArray(context.forbiddenEntityVersionIds);
    const forbiddenNames = context.project.characterLinks
      .filter((link) => link.selectedVersionId && forbiddenIds.includes(link.selectedVersionId))
      .map((link) => link.character.name);
    this.assertSafeGeneration(context, role, prompt);
    const record = await this.prisma.childrenClipShotAsset.create({
      data: {
        shotId, role, origin: 'generated', status: 'draft',
        versionNumber: await this.nextVersion(shotId, role),
        label: input.label?.trim() || null,
        generationPrompt: prompt,
        negativePrompt: forbiddenNames.length ? `forbidden entities: ${forbiddenNames.join(', ')}` : null
      }
    });
    await this.enqueueExisting(projectId, organizationId, userId, record.id);
  }

  private async enqueueExisting(projectId: string, organizationId: string, userId: string, shotAssetId: string) {
    const queued = await this.queue.enqueueShotAsset({ projectId, organizationId, requestedByUserId: userId, shotAssetId });
    await this.prisma.$transaction([
      this.prisma.childrenClipShotAsset.update({
        where: { id: shotAssetId },
        data: { status: 'queued', bullJobId: queued.bullJobId, errorMessage: null, reviewReason: null, generationStartedAt: null, generationEndedAt: null }
      }),
      this.prisma.processingJob.create({
        data: {
          projectId, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME,
          bullJobId: queued.bullJobId, status: ProcessingJobStatus.queued, progress: 0,
          detailMessage: 'Asset visual da tomada enfileirado.',
          activityLog: [{ stage: 'QUEUED', message: 'Asset visual da tomada enfileirado.', shotAssetId, progress: 0, timestamp: new Date().toISOString() }]
        }
      })
    ]);
  }

  private nextVersion(shotId: string, role: ChildrenClipShotAssetRole) {
    return this.prisma.childrenClipShotAsset.aggregate({ where: { shotId, role }, _max: { versionNumber: true } })
      .then((result) => (result._max.versionNumber ?? 0) + 1);
  }

  private assertApprovedPlan(status: string | undefined) {
    if (status !== 'approved') throw new BadRequestException('Aprove o plano de producao antes de criar os assets das tomadas');
  }

  private async getOwnedAsset(projectId: string, shotAssetId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const shotAsset = await this.prisma.childrenClipShotAsset.findFirst({
      where: { id: shotAssetId, shot: { projectId } }, include: { asset: true }
    });
    if (!shotAsset) throw new NotFoundException('Asset da tomada nao encontrado');
    return { project, shotAsset };
  }

  private async getOwnedProject(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null },
      include: {
        childrenClip: true, childrenClipPlan: true,
        childrenClipStyleProfile: true,
        characterLinks: { include: { character: true } },
        childrenClipShots: {
          orderBy: { index: 'asc' },
          include: {
            location: { include: { masterBackgroundAsset: { include: { childrenClipShotAsset: true } } } },
            musicSection: true,
            assets: { orderBy: [{ role: 'asc' }, { versionNumber: 'desc' }], include: { asset: true } }
          }
        }
      }
    });
    if (!project?.childrenClip) throw new NotFoundException('Projeto de clipe infantil nao encontrado');
    return project;
  }

  private async assertLockedStyle(projectId: string) {
    const style = await this.styles.lock(projectId);
    if (style.status !== 'locked') {
      throw new BadRequestException(style.staleReason || 'O Style Lock esta desatualizado. Revise e atualize antes de gerar cenarios.');
    }
  }

  private buildLocationWorkflow(project: Awaited<ReturnType<ChildrenClipAssetsService['getOwnedProject']>>) {
    const groups = new Map<string, typeof project.childrenClipShots>();
    for (const shot of project.childrenClipShots) {
      const key = shot.locationId || `shot:${shot.id}`;
      groups.set(key, [...(groups.get(key) ?? []), shot]);
    }
    return [...groups.entries()].map(([key, shots]) => {
      const ordered = [...shots].sort((left, right) => left.index - right.index);
      const location = ordered[0].location;
      const masterLink = location?.masterBackgroundAsset?.childrenClipShotAsset ?? null;
      const master = masterLink?.status === 'approved' && this.isStyleCompatible(masterLink, project.childrenClipStyleProfile)
        ? {
            shotAssetId: masterLink.id,
            assetId: location!.masterBackgroundAsset!.id,
            shotId: masterLink.shotId,
            versionNumber: masterLink.versionNumber,
            status: masterLink.status,
            approvedAt: masterLink.approvedAt
          }
        : null;
      const workflowShots = ordered.map((shot) => {
        const backgrounds = shot.assets.filter((asset) => asset.role === 'background');
        const hasUsableBackground = backgrounds.some((asset) => this.hasUsableBackground(asset, project.childrenClipStyleProfile));
        const approvedBackground = backgrounds.find((asset) => asset.status === 'approved' && this.isStyleCompatible(asset, project.childrenClipStyleProfile));
        return { id: shot.id, index: shot.index, title: shot.title, description: shot.description, framing: shot.framing, cameraMovement: shot.cameraMovement, hasUsableBackground, hasApprovedBackground: Boolean(approvedBackground), approvedBackgroundVersion: approvedBackground?.versionNumber ?? null };
      });
      const anchor = workflowShots[0];
      const masterPendingReview = !master && ordered[0].assets.some((asset) => asset.role === 'background' && asset.status === 'ready_for_review' && this.isStyleCompatible(asset, project.childrenClipStyleProfile));
      const masterGenerating = !master && ordered[0].assets.some((asset) => asset.role === 'background' && ['queued', 'generating'].includes(asset.status));
      return {
        id: location?.id ?? key,
        key: location?.key ?? key,
        name: location?.name ?? ordered[0].environment,
        description: location?.description ?? ordered[0].environment,
        anchorShotId: anchor.id,
        master,
        phase: locationWorkflowPhase(workflowShots, Boolean(master), masterPendingReview, masterGenerating),
        approvedShots: workflowShots.filter((shot) => shot.approvedBackgroundVersion !== null).length,
        shots: workflowShots
      };
    });
  }

  private async enqueueLocationTargets(
    project: Awaited<ReturnType<ChildrenClipAssetsService['getOwnedProject']>>,
    location: ReturnType<ChildrenClipAssetsService['buildLocationWorkflow']>[number],
    projectId: string,
    organizationId: string,
    userId: string
  ) {
    const targets = selectLocationGenerationTargets(
      location.shots.map((shot) => ({ id: shot.id, index: shot.index, hasUsableBackground: shot.hasUsableBackground })),
      Boolean(location.master)
    );
    for (const shotId of targets) {
      const shot = project.childrenClipShots.find((item) => item.id === shotId)!;
      await this.createAndEnqueue(projectId, organizationId, userId, shot.id, {
        role: 'background', prompt: shot.backgroundPrompt,
        label: location.master ? `${location.name} - vista da tomada ${shot.index + 1}` : `${location.name} - master`
      });
    }
  }

  private hasUsableBackground(
    asset: { role: string; status: string; origin: string; approvedAt: Date | null; generationMetadata: unknown },
    styleLock: { status: string; versionNumber: number; lockedAt: Date } | null
  ) {
    return asset.role === 'background' && (
      ['queued', 'generating'].includes(asset.status)
      || ['ready_for_review', 'approved'].includes(asset.status) && this.isStyleCompatible(asset, styleLock)
    );
  }

  private assertLocationBackgroundCanProceed(
    project: Awaited<ReturnType<ChildrenClipAssetsService['getOwnedProject']>>,
    shotId: string
  ) {
    const location = this.buildLocationWorkflow(project).find((item) => item.shots.some((shot) => shot.id === shotId));
    if (!location) throw new NotFoundException('Location da tomada nao encontrada');
    if (!location.master && location.anchorShotId !== shotId) {
      throw new BadRequestException(`Aprove primeiro o background master de ${location.name} antes de criar as outras vistas.`);
    }
  }

  private isStyleCompatible(
    asset: { role: string; origin: string; approvedAt: Date | null; generationMetadata: unknown },
    styleLock: { status: string; versionNumber: number; lockedAt: Date } | null
  ) {
    if (asset.role !== 'background') return true;
    if (!styleLock || styleLock.status !== 'locked') return false;
    if (asset.origin === 'uploaded') return Boolean(asset.approvedAt && asset.approvedAt >= styleLock.lockedAt);
    const metadata = asset.generationMetadata && typeof asset.generationMetadata === 'object' && !Array.isArray(asset.generationMetadata)
      ? asset.generationMetadata as Record<string, unknown> : {};
    return metadata.styleProfileVersion === styleLock.versionNumber;
  }

  private assertSafeGeneration(
    shot: {
      index: number; purpose: string; description: string; backgroundPrompt: string;
      characterVersionIds: unknown; forbiddenEntityVersionIds: unknown;
      project: { childrenClipPlan: { narrative: unknown } | null; characterLinks: Array<{ selectedVersionId: string | null; character: { name: string } }> };
    },
    role: ChildrenClipShotAssetRole,
    prompt: string
  ) {
    if (!shot.purpose.trim()) throw new BadRequestException(`A tomada ${shot.index + 1} usa o plano legado. Use Replanejar tomadas antes de gerar novos assets.`);
    const allowed = this.stringArray(shot.characterVersionIds);
    const forbidden = this.stringArray(shot.forbiddenEntityVersionIds);
    if (new Set(allowed).size !== allowed.length || new Set(forbidden).size !== forbidden.length) {
      throw new BadRequestException('O Shot Plan possui entidades duplicadas');
    }
    if (allowed.some((id) => forbidden.includes(id))) throw new BadRequestException('O Shot Plan possui conflito entre entidades permitidas e proibidas');
    const knownIds = new Set(shot.project.characterLinks.map((link) => link.selectedVersionId).filter(Boolean));
    if ([...allowed, ...forbidden].some((id) => !knownIds.has(id))) throw new BadRequestException('O Shot Plan referencia uma entidade desconhecida');
    const narrative = shot.project.childrenClipPlan?.narrative;
    const global = narrative && typeof narrative === 'object' && !Array.isArray(narrative) ? narrative as Record<string, unknown> : {};
    const summaries = [global.summary, global.logline].filter((item): item is string => typeof item === 'string').map((item) => this.normalize(item));
    if (summaries.includes(this.normalize(prompt))) throw new BadRequestException('A descricao visual da tomada nao pode repetir a narrativa global');
    if (role === 'background') {
      const entity = shot.project.characterLinks.find((link) => this.containsName(prompt, link.character.name));
      if (entity) throw new BadRequestException(`Fundo sem personagens nao pode solicitar ${entity.character.name}`);
    }
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private normalize(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private containsName(text: string, name: string) {
    const target = this.normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return target.length > 1 && new RegExp(`(^|[^a-z0-9])${target}($|[^a-z0-9])`).test(this.normalize(text));
  }
}
