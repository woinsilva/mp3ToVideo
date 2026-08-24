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

@Injectable()
export class ChildrenClipAssetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService
  ) {}

  async get(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const jobs = await this.prisma.processingJob.findMany({
      where: { projectId, jobName: CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME },
      orderBy: { createdAt: 'desc' }
    });
    const jobByBullId = new Map(jobs.map((job) => [job.bullJobId, job]));
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
          } : null
        };
      })
    }));
    const approvedBackgrounds = shots.filter((shot) =>
      shot.assets.some((asset) => asset.role === 'background' && asset.status === 'approved')
    ).length;
    return {
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
    for (const shot of project.childrenClipShots) {
      const hasUsable = shot.assets.some((asset) =>
        asset.role === 'background' && ['queued', 'generating', 'ready_for_review', 'approved'].includes(asset.status)
      );
      if (!hasUsable) {
        await this.createAndEnqueue(projectId, organizationId, userId, shot.id, {
          role: 'background', prompt: shot.backgroundPrompt, label: `Cenario da tomada ${shot.index + 1}`
        });
      }
    }
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
    if (!project.childrenClipShots.some((shot) => shot.id === shotId)) throw new NotFoundException('Tomada nao encontrada');
    await this.createAndEnqueue(projectId, organizationId, userId, shotId, input);
    return this.get(projectId, organizationId);
  }

  async retry(projectId: string, shotAssetId: string, organizationId: string, userId: string) {
    const { project, shotAsset } = await this.getOwnedAsset(projectId, shotAssetId, organizationId);
    this.assertApprovedPlan(project.childrenClipPlan?.status);
    if (shotAsset.origin !== 'generated') throw new BadRequestException('Somente assets gerados podem ser reenfileirados');
    if (shotAsset.status === 'queued' || shotAsset.status === 'generating') {
      throw new BadRequestException('A geracao deste asset ja esta em andamento');
    }
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
    const { shotAsset } = await this.getOwnedAsset(projectId, shotAssetId, organizationId);
    if (!shotAsset.assetId || !['ready_for_review', 'approved'].includes(shotAsset.status)) {
      throw new BadRequestException('O asset precisa estar pronto para revisao antes da aprovacao');
    }
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
      })
    ]);
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

  private async createAndEnqueue(
    projectId: string, organizationId: string, userId: string, shotId: string,
    input: GenerateChildrenClipShotAssetDto
  ) {
    const role = input.role as ChildrenClipShotAssetRole;
    const shot = await this.prisma.childrenClipShot.findUnique({ where: { id: shotId } });
    if (!shot) throw new NotFoundException('Tomada nao encontrada');
    const record = await this.prisma.childrenClipShotAsset.create({
      data: {
        shotId, role, origin: 'generated', status: 'draft',
        versionNumber: await this.nextVersion(shotId, role),
        label: input.label?.trim() || null,
        generationPrompt: input.prompt?.trim() || (role === 'background' ? shot.backgroundPrompt : shot.description)
      }
    });
    await this.enqueueExisting(projectId, organizationId, userId, record.id);
  }

  private async enqueueExisting(projectId: string, organizationId: string, userId: string, shotAssetId: string) {
    const queued = await this.queue.enqueueShotAsset({ projectId, organizationId, requestedByUserId: userId, shotAssetId });
    await this.prisma.$transaction([
      this.prisma.childrenClipShotAsset.update({
        where: { id: shotAssetId },
        data: { status: 'queued', bullJobId: queued.bullJobId, errorMessage: null, generationStartedAt: null, generationEndedAt: null }
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
        childrenClipShots: { orderBy: { index: 'asc' }, include: { assets: { orderBy: [{ role: 'asc' }, { versionNumber: 'desc' }], include: { asset: true } } } }
      }
    });
    if (!project?.childrenClip) throw new NotFoundException('Projeto de clipe infantil nao encontrado');
    return project;
  }
}
