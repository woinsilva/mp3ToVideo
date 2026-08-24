import { randomInt } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProcessingJobStatus } from '@prisma/client';
import { CHILDREN_CLIP_FINAL_RENDER_JOB_NAME, CHILDREN_CLIP_HERO_SHOT_JOB_NAME, CHILDREN_CLIP_QUEUE_NAME } from '@video/shared';

import { PrismaService } from '../../../database/prisma.service';
import { ChildrenClipQueueService } from '../../jobs/services/children-clip-queue.service';
import { LocalStorageService } from './local-storage.service';

@Injectable()
export class ChildrenClipOutputService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService
  ) {}

  async get(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const latestFinal = project.childrenClipFinalRenders[0] ?? null;
    return {
      heroShots: project.childrenClipShots.filter((shot) => shot.renderMode !== 'animation_2d').map((shot) => ({
        id: shot.id, index: shot.index, title: shot.title, renderMode: shot.renderMode,
        latestAttempt: shot.heroShotAttempts[0] ?? null
      })),
      finalRender: latestFinal ? { ...latestFinal, hasVideo: Boolean(latestFinal.assetId) } : null,
      readyForFinal: this.finalBlockers(project).length === 0,
      blockers: this.finalBlockers(project)
    };
  }

  async generateHero(projectId: string, shotId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const shot = project.childrenClipShots.find((item) => item.id === shotId);
    if (!shot) throw new NotFoundException('Tomada nao encontrada');
    if (shot.renderMode === 'animation_2d') throw new BadRequestException('Esta tomada foi definida somente como animacao 2D');
    if (!shot.assets.some((asset) => (asset.role === 'background' || asset.role === 'storyboard_frame') && asset.status === 'approved' && asset.assetId)) {
      throw new BadRequestException('Aprove um fundo ou storyboard para usar como referencia da tomada Wan');
    }
    if (shot.heroShotAttempts[0] && ['queued', 'generating', 'validating'].includes(shot.heroShotAttempts[0].status)) {
      throw new BadRequestException('A tomada especial ja esta em andamento');
    }
    await this.createHeroAttempt(project, shotId, organizationId, userId);
    return this.get(projectId, organizationId);
  }

  async retryHero(projectId: string, attemptId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const attempt = await this.prisma.childrenClipHeroShotAttempt.findFirst({ where: { id: attemptId, shot: { projectId } } });
    if (!attempt) throw new NotFoundException('Tentativa Wan nao encontrada');
    if (attempt.status !== 'failed') throw new BadRequestException('Somente tentativas com falha podem ser reenfileiradas');
    await this.createHeroAttempt(project, attempt.shotId, organizationId, userId);
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
    return { absolutePath: this.storage.getAbsolutePath(result.asset.storagePath), mimeType: result.asset.mimeType, fileName: kind === 'hero' ? 'tomada-wan.mp4' : 'clipe-infantil-final.mp4' };
  }

  private async createHeroAttempt(project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>, shotId: string, organizationId: string, userId: string) {
    const shot = project.childrenClipShots.find((item) => item.id === shotId)!;
    const attemptNumber = (await this.prisma.childrenClipHeroShotAttempt.aggregate({ where: { shotId }, _max: { attemptNumber: true } }))._max.attemptNumber ?? 0;
    const fps = project.generationFps || 16;
    const requestedFrames = Math.max(1, Math.round(shot.durationSeconds * fps));
    const frameCount = Math.max(1, Math.round((requestedFrames - 1) / 4) * 4 + 1);
    const portrait = project.childrenClip?.aspectRatio === 'portrait_9_16';
    const square = project.childrenClip?.aspectRatio === 'square_1_1';
    const attempt = await this.prisma.childrenClipHeroShotAttempt.create({ data: { shotId, attemptNumber: attemptNumber + 1, status: 'queued', seed: randomInt(0, 2_147_483_647), fps, width: portrait ? 576 : square ? 768 : 1024, height: portrait ? 1024 : square ? 768 : 576, frameCount, stage: 'QUEUED' } });
    const queued = await this.queue.enqueueHeroShot({ projectId: project.id, organizationId, requestedByUserId: userId, heroAttemptId: attempt.id });
    await this.prisma.$transaction([
      this.prisma.childrenClipHeroShotAttempt.update({ where: { id: attempt.id }, data: { bullJobId: queued.bullJobId } }),
      this.prisma.processingJob.create({ data: { projectId: project.id, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_HERO_SHOT_JOB_NAME, bullJobId: queued.bullJobId, status: 'queued', progress: 0, detailMessage: `Tomada Wan ${shot.index + 1} enfileirada.`, activityLog: [{ stage: 'QUEUED', message: `Tomada Wan ${shot.index + 1} enfileirada.`, heroAttemptId: attempt.id, progress: 0, timestamp: new Date().toISOString() }] } })
    ]);
  }

  private finalBlockers(project: Awaited<ReturnType<ChildrenClipOutputService['getOwnedProject']>>) {
    const blockers: string[] = [];
    if (!project.track) blockers.push('A musica original nao esta disponivel.');
    for (const shot of project.childrenClipShots) {
      if (shot.renderMode === 'wan' && shot.heroShotAttempts[0]?.status !== 'approved') blockers.push(`Aprove a tomada Wan ${shot.index + 1}.`);
      if (shot.renderMode !== 'wan' && shot.renderAttempts[0]?.status !== 'completed' && shot.heroShotAttempts[0]?.status !== 'approved') blockers.push(`Conclua a tomada ${shot.index + 1}.`);
    }
    return blockers;
  }

  private async getOwnedProject(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null }, include: { childrenClip: true, childrenClipPlan: true, track: true, childrenClipFinalRenders: { orderBy: { versionNumber: 'desc' } }, childrenClipShots: { orderBy: { index: 'asc' }, include: { renderAttempts: { where: { status: 'completed' }, orderBy: { attemptNumber: 'desc' }, take: 1, include: { asset: true } }, heroShotAttempts: { orderBy: { attemptNumber: 'desc' }, take: 1, include: { asset: true } }, assets: { where: { status: 'approved' }, include: { asset: true } } } } } });
    if (!project?.childrenClip) throw new NotFoundException('Projeto de clipe infantil nao encontrado');
    return project;
  }
}
