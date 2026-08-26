import { randomInt } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProcessingJobStatus } from '@prisma/client';
import { CHILDREN_CLIP_FINAL_RENDER_JOB_NAME, CHILDREN_CLIP_HERO_SHOT_JOB_NAME, CHILDREN_CLIP_QUEUE_NAME, SNAPGEN_VIDEO_MODELS } from '@video/shared';

import { PrismaService } from '../../../database/prisma.service';
import { ChildrenClipQueueService } from '../../jobs/services/children-clip-queue.service';
import { LocalStorageService } from './local-storage.service';
import type { GenerateChildrenClipVideoDto } from '../dtos/generate-children-clip-video.dto';

@Injectable()
export class ChildrenClipOutputService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async get(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const latestFinal = project.childrenClipFinalRenders[0] ?? null;
    return {
      heroShots: project.childrenClipShots.filter((shot) => shot.renderMode !== 'animation_2d').map((shot) => ({
        id: shot.id, index: shot.index, title: shot.title, renderMode: shot.renderMode,
        durationSeconds: shot.durationSeconds,
        videoGenerationConfig: shot.videoGenerationConfig,
        automaticPrompt: this.automaticPrompt(project, shot),
        approvedStoryboardAssetId: shot.assets.find((asset) => asset.role === 'storyboard_frame')?.assetId ?? null,
        latestAttempt: shot.heroShotAttempts[0] ?? null
      })),
      availableReferences: this.availableReferences(project),
      snapgen: { configured: this.config.get<boolean>('snapgen.configured', false), models: SNAPGEN_VIDEO_MODELS },
      finalRender: latestFinal ? { ...latestFinal, hasVideo: Boolean(latestFinal.assetId) } : null,
      readyForFinal: this.finalBlockers(project).length === 0,
      blockers: this.finalBlockers(project)
    };
  }

  async generateHero(projectId: string, shotId: string, organizationId: string, userId: string, input: GenerateChildrenClipVideoDto) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const shot = project.childrenClipShots.find((item) => item.id === shotId);
    if (!shot) throw new NotFoundException('Tomada nao encontrada');
    if (shot.renderMode === 'animation_2d') throw new BadRequestException('Esta tomada foi definida somente como animacao 2D');
    if (shot.heroShotAttempts[0] && ['queued', 'generating', 'validating'].includes(shot.heroShotAttempts[0].status)) {
      throw new BadRequestException('A tomada especial ja esta em andamento');
    }
    await this.createHeroAttempt(project, shotId, organizationId, userId, input);
    return this.get(projectId, organizationId);
  }

  async retryHero(projectId: string, attemptId: string, organizationId: string, userId: string, input: GenerateChildrenClipVideoDto) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const attempt = await this.prisma.childrenClipHeroShotAttempt.findFirst({ where: { id: attemptId, shot: { projectId } } });
    if (!attempt) throw new NotFoundException('Tentativa de video nao encontrada');
    if (attempt.status !== 'failed') throw new BadRequestException('Somente tentativas com falha podem ser reenfileiradas');
    await this.createHeroAttempt(project, attempt.shotId, organizationId, userId, input);
    return this.get(projectId, organizationId);
  }

  async approveHero(projectId: string, attemptId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);
    const attempt = await this.prisma.childrenClipHeroShotAttempt.findFirst({ where: { id: attemptId, shot: { projectId } } });
    if (!attempt) throw new NotFoundException('Tentativa Wan nao encontrada');
    if (attempt.status !== 'ready_for_review' && attempt.status !== 'approved') throw new BadRequestException('A tomada Wan precisa estar pronta para revisao');
    await this.prisma.$transaction([
      this.prisma.childrenClipHeroShotAttempt.updateMany({ where: { shotId: attempt.shotId, status: 'approved', id: { not: attempt.id } }, data: { status: 'ready_for_review', approvedAt: null } }),
      this.prisma.childrenClipHeroShotAttempt.update({ where: { id: attempt.id }, data: { status: 'approved', approvedAt: new Date() } })
    ]);
    return this.get(projectId, organizationId);
  }

  async rejectHero(projectId: string, attemptId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);
    const attempt = await this.prisma.childrenClipHeroShotAttempt.findFirst({ where: { id: attemptId, shot: { projectId } } });
    if (!attempt) throw new NotFoundException('Tentativa Wan nao encontrada');
    if (attempt.status !== 'ready_for_review') throw new BadRequestException('Somente uma tomada pronta para revisao pode ser rejeitada');
    await this.prisma.childrenClipHeroShotAttempt.update({
      where: { id: attempt.id }, data: { status: 'rejected', approvedAt: null }
    });
    return this.get(projectId, organizationId);
  }

  async renderFinal(projectId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const blockers = this.finalBlockers(project);
    if (blockers.length) throw new BadRequestException(blockers.join(' '));
    const latest = project.childrenClipFinalRenders[0];
    if (latest && ['queued', 'compositing', 'encoding', 'validating'].includes(latest.status)) throw new BadRequestException('O render final ja esta em andamento');
    const versionNumber = (await this.prisma.childrenClipFinalRender.aggregate({ where: { projectId }, _max: { versionNumber: true } }))._max.versionNumber ?? 0;
    const finalRender = await this.prisma.childrenClipFinalRender.create({ data: { projectId, versionNumber: versionNumber + 1, status: 'queued', stage: 'QUEUED' } });
    const queued = await this.queue.enqueueFinalRender({ projectId, organizationId, requestedByUserId: userId, finalRenderId: finalRender.id });
    await this.prisma.$transaction([
      this.prisma.childrenClipFinalRender.update({ where: { id: finalRender.id }, data: { bullJobId: queued.bullJobId } }),
      this.prisma.processingJob.create({ data: { projectId, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_FINAL_RENDER_JOB_NAME, bullJobId: queued.bullJobId, status: ProcessingJobStatus.queued, progress: 0, detailMessage: 'Composicao final do clipe enfileirada.', activityLog: [{ stage: 'QUEUED', message: 'Composicao final do clipe enfileirada.', finalRenderId: finalRender.id, progress: 0, timestamp: new Date().toISOString() }] } })
    ]);
    return this.get(projectId, organizationId);
  }

  async retryFinal(projectId: string, finalRenderId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const render = project.childrenClipFinalRenders.find((item) => item.id === finalRenderId);
    if (!render) throw new NotFoundException('Render final nao encontrado');
    if (render.status !== 'failed') throw new BadRequestException('Somente um render final com falha pode ser reenfileirado');
    const queued = await this.queue.enqueueFinalRender({ projectId, organizationId, requestedByUserId: userId, finalRenderId });
    await this.prisma.$transaction([
      this.prisma.childrenClipFinalRender.update({ where: { id: finalRenderId }, data: { status: 'queued', bullJobId: queued.bullJobId, progress: 0, stage: 'QUEUED', errorMessage: null, renderStartedAt: null, renderCompletedAt: null } }),
      this.prisma.processingJob.create({ data: { projectId, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_FINAL_RENDER_JOB_NAME, bullJobId: queued.bullJobId, status: 'queued', progress: 0, detailMessage: 'Retry da composicao final enfileirado.' } })
    ]);
    return this.get(projectId, organizationId);
  }

  async getFile(projectId: string, id: string, kind: 'hero' | 'final', organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);
    const result = kind === 'hero'
      ? await this.prisma.childrenClipHeroShotAttempt.findFirst({ where: { id, shot: { projectId } }, include: { asset: true } })
      : await this.prisma.childrenClipFinalRender.findFirst({ where: { id, projectId }, include: { asset: true } });
    if (!result?.asset) throw new NotFoundException('Arquivo de video nao encontrado');
    return { absolutePath: this.storage.getAbsolutePath(result.asset.storagePath), mimeType: result.asset.mimeType, fileName: kind === 'hero' ? 'tomada-especial.mp4' : 'clipe-infantil-final.mp4' };
  }

  async getReferenceFile(projectId: string, assetId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    if (!this.availableReferences(project).some((reference) => reference.id === assetId)) throw new NotFoundException('Referencia aprovada nao encontrada');
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, projectId, organizationId } });
    if (!asset) throw new NotFoundException('Arquivo da referencia nao encontrado');
    return { absolutePath: this.storage.getAbsolutePath(asset.storagePath), mimeType: asset.mimeType };
  }

  private async createHeroAttempt(project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>, shotId: string, organizationId: string, userId: string, input: GenerateChildrenClipVideoDto) {
    const shot = project.childrenClipShots.find((item) => item.id === shotId)!;
    const request = this.resolveVideoRequest(project, shot, input);
    const attemptNumber = (await this.prisma.childrenClipHeroShotAttempt.aggregate({ where: { shotId }, _max: { attemptNumber: true } }))._max.attemptNumber ?? 0;
    const fps = request.provider === 'snapgen' ? 24 : project.generationFps || 16;
    const requestedFrames = Math.max(1, Math.round((request.provider === 'snapgen' ? 8 : shot.durationSeconds) * fps));
    const frameCount = Math.max(1, Math.round((requestedFrames - 1) / 4) * 4 + 1);
    const portrait = project.childrenClip?.aspectRatio === 'portrait_9_16';
    const square = project.childrenClip?.aspectRatio === 'square_1_1';
    const width = request.provider === 'snapgen' ? (portrait ? 720 : 1280) : portrait ? 576 : square ? 768 : 1024;
    const height = request.provider === 'snapgen' ? (portrait ? 1280 : 720) : portrait ? 1024 : square ? 768 : 576;
    const attempt = await this.prisma.childrenClipHeroShotAttempt.create({ data: {
      shotId, attemptNumber: attemptNumber + 1, status: 'queued', seed: randomInt(0, 2_147_483_647), fps, width, height, frameCount, stage: 'QUEUED',
      provider: request.provider === 'snapgen' ? 'snapgen' : 'comfyui-video',
      requestMetadata: request as unknown as Prisma.InputJsonValue,
      generationManifest: { request } as unknown as Prisma.InputJsonValue
    } });
    await this.prisma.childrenClipShot.update({ where: { id: shotId }, data: { videoGenerationConfig: request as unknown as Prisma.InputJsonValue } });
    const queued = await this.queue.enqueueHeroShot({ projectId: project.id, organizationId, requestedByUserId: userId, heroAttemptId: attempt.id });
    await this.prisma.$transaction([
      this.prisma.childrenClipHeroShotAttempt.update({ where: { id: attempt.id }, data: { bullJobId: queued.bullJobId } }),
      this.prisma.processingJob.create({ data: { projectId: project.id, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_HERO_SHOT_JOB_NAME, bullJobId: queued.bullJobId, status: 'queued', progress: 0, detailMessage: `Tomada ${request.provider === 'snapgen' ? 'SnapGen' : 'Wan'} ${shot.index + 1} enfileirada.`, activityLog: [{ stage: 'QUEUED', message: `Tomada ${request.provider === 'snapgen' ? 'SnapGen' : 'Wan'} ${shot.index + 1} enfileirada.`, heroAttemptId: attempt.id, provider: request.provider, progress: 0, timestamp: new Date().toISOString() }] } })
    ]);
  }

  private resolveVideoRequest(
    project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>,
    shot: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>['childrenClipShots'][number],
    input: GenerateChildrenClipVideoDto
  ) {
    const prompt = input.prompt?.trim() || this.automaticPrompt(project, shot);
    if (!prompt) throw new BadRequestException('O prompt de video e obrigatorio');
    if (input.provider === 'local') {
      const referenceAssetId = input.firstImageAssetId || shot.assets.find((asset) => asset.role === 'storyboard_frame')?.assetId || shot.assets[0]?.assetId;
      if (!referenceAssetId) throw new BadRequestException('Aprove uma preview completa ou fundo para a tomada local');
      this.assertApprovedReferences(project, [referenceAssetId]);
      return { provider: 'local' as const, prompt, referenceAssetIds: [referenceAssetId], firstImageAssetId: referenceAssetId };
    }
    if (!this.config.get<boolean>('snapgen.configured', false)) throw new BadRequestException('SNAPGEN_API_KEY nao esta configurada no servidor');
    if (shot.durationSeconds > 8.001) throw new BadRequestException('Veo 3.1 Fast suporta 8s; divida tomadas maiores ou use o provider local');
    if (project.childrenClip?.aspectRatio === 'square_1_1') throw new BadRequestException('Veo 3.1 Fast nao suporta o formato quadrado deste projeto');
    const model = input.model ?? 'veo-3.1-fast';
    const resolution = input.resolution ?? '720p';
    const referenceMode = input.referenceMode ?? 'frame';
    const aspectRatio = project.childrenClip?.aspectRatio === 'portrait_9_16' ? '9:16' : '16:9';
    const firstDefault = shot.assets.find((asset) => asset.role === 'storyboard_frame')?.assetId ?? null;
    const referenceAssetIds = referenceMode === 'frame'
      ? [input.firstImageAssetId || firstDefault, input.lastImageAssetId].filter((id): id is string => Boolean(id))
      : [...new Set(input.ingredientAssetIds ?? [])];
    if (referenceMode === 'frame' && !referenceAssetIds.length) throw new BadRequestException('Selecione a First Image; a preview aprovada e recomendada');
    if (referenceMode === 'ingredient' && (referenceAssetIds.length < 1 || referenceAssetIds.length > 3)) throw new BadRequestException('Selecione de 1 a 3 Ingredient Images');
    this.assertApprovedReferences(project, referenceAssetIds);
    return {
      provider: 'snapgen' as const, model, resolution, durationSeconds: 8, aspectRatio, referenceMode, prompt,
      firstImageAssetId: referenceMode === 'frame' ? referenceAssetIds[0] : null,
      lastImageAssetId: referenceMode === 'frame' ? referenceAssetIds[1] ?? null : null,
      ingredientAssetIds: referenceMode === 'ingredient' ? referenceAssetIds : [], referenceAssetIds
    };
  }

  private assertApprovedReferences(project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>, ids: string[]) {
    const allowed = new Set(this.availableReferences(project).map((asset) => asset.id));
    const invalid = ids.filter((id) => !allowed.has(id));
    if (invalid.length) throw new BadRequestException('Uma ou mais referencias nao pertencem ao projeto, estao stale ou nao foram aprovadas');
  }

  private automaticPrompt(project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>, shot: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>['childrenClipShots'][number]) {
    const bible = project.childrenClipPlan?.visualBible;
    return [
      shot.description, `Action: ${shot.characterAction}`, `Setting: ${shot.environment}`,
      shot.timeOfDay ? `Lighting/time: ${shot.timeOfDay}` : null,
      `Camera shot: ${shot.framing}`, `Camera movement: ${shot.cameraMovement}`,
      shot.motionIntent ? `Motion intent: ${shot.motionIntent}` : null,
      shot.continuityFromPreviousShot ? `Continuity: ${shot.continuityFromPreviousShot}` : null,
      `Shot purpose: ${shot.purpose}`, bible ? `Project visual bible: ${JSON.stringify(bible)}` : null,
      'Preserve the exact approved first-frame composition, identities, clothing, colors and environment. Subtle coherent motion only. No scene transition, no text, no generated audio.'
    ].filter(Boolean).join('. ').slice(0, 6000);
  }

  private availableReferences(project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>) {
    const shotAssets = project.childrenClipShots.flatMap((shot) => shot.assets.flatMap((item) => item.asset ? [{
      id: item.asset.id, name: item.label || `Tomada ${shot.index + 1} - ${item.role}`, type: item.role,
      origin: item.origin, version: item.versionNumber, shotId: shot.id, mimeType: item.asset.mimeType
    }] : []));
    const characterAssets = project.characterLinks.flatMap((link) => link.selectedVersion?.assets.flatMap((item) => item.asset && item.status === 'approved' ? [{
      id: item.asset.id, name: `${link.character.name} - ${item.label || item.role}`, type: 'character',
      origin: item.origin, version: link.selectedVersion!.versionNumber, characterName: link.character.name, mimeType: item.asset.mimeType
    }] : []) ?? []);
    return [...shotAssets, ...characterAssets];
  }

  private finalBlockers(project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>) {
    const blockers: string[] = [];
    if (!project.track) blockers.push('A musica original nao esta disponivel.');
    for (const shot of project.childrenClipShots) {
      if (['wan', 'snapgen'].includes(shot.renderMode) && shot.heroShotAttempts[0]?.status !== 'approved') blockers.push(`Aprove a tomada generativa ${shot.index + 1}.`);
      if (!['wan', 'snapgen'].includes(shot.renderMode) && shot.renderAttempts[0]?.status !== 'completed' && shot.heroShotAttempts[0]?.status !== 'approved') blockers.push(`Conclua a tomada ${shot.index + 1}.`);
    }
    return blockers;
  }

  private async getOwnedProject(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null }, include: { childrenClip: true, childrenClipPlan: true, track: true, characterLinks: { include: { character: true, selectedVersion: { include: { assets: { include: { asset: true } } } } } }, childrenClipFinalRenders: { orderBy: { versionNumber: 'desc' } }, childrenClipShots: { orderBy: { index: 'asc' }, include: { renderAttempts: { where: { status: 'completed' }, orderBy: { attemptNumber: 'desc' }, take: 1, include: { asset: true } }, heroShotAttempts: { orderBy: { attemptNumber: 'desc' }, take: 1, include: { asset: true } }, assets: { where: { status: 'approved' }, include: { asset: true } } } } } });
    if (!project?.childrenClip) throw new NotFoundException('Projeto de clipe infantil nao encontrado');
    return project;
  }
}
