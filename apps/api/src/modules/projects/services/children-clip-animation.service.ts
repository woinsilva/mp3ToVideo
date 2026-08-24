import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProcessingJobStatus } from '@prisma/client';
import { CHILDREN_CLIP_QUEUE_NAME, CHILDREN_CLIP_SHOT_RENDER_JOB_NAME } from '@video/shared';

import { PrismaService } from '../../../database/prisma.service';
import { ChildrenClipQueueService } from '../../jobs/services/children-clip-queue.service';
import { LocalStorageService } from './local-storage.service';

@Injectable()
export class ChildrenClipAnimationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService
  ) {}

  async get(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    return {
      shots: project.childrenClipShots.map((shot) => ({
        id: shot.id, index: shot.index, title: shot.title, startSeconds: shot.startSeconds,
        endSeconds: shot.endSeconds, durationSeconds: shot.durationSeconds, renderMode: shot.renderMode,
        hasApprovedBackground: shot.assets.some((asset) => asset.role === 'background' && asset.status === 'approved'),
        latestAttempt: shot.renderAttempts[0] ? this.presentAttempt(shot.renderAttempts[0]) : null
      })),
      summary: {
        total2dShots: project.childrenClipShots.filter((shot) => shot.renderMode !== 'wan').length,
        completed2dShots: project.childrenClipShots.filter((shot) => shot.renderMode !== 'wan' && shot.renderAttempts[0]?.status === 'completed').length
      }
    };
  }

  async renderMissing(projectId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertPlan(project.childrenClipPlan?.status);
    const targets = project.childrenClipShots.filter((shot) =>
      shot.renderMode !== 'wan' && shot.assets.some((asset) => asset.role === 'background' && asset.status === 'approved') &&
      !shot.renderAttempts.some((attempt) => ['queued', 'rendering', 'completed'].includes(attempt.status))
    );
    const missingBackground = project.childrenClipShots.some((shot) => shot.renderMode !== 'wan' && !shot.assets.some((asset) => asset.role === 'background' && asset.status === 'approved'));
    if (missingBackground) throw new BadRequestException('Aprove um fundo para cada tomada 2D antes de renderizar em lote');
    for (const shot of targets) await this.createAttempt(project, shot.id, organizationId, userId);
    return this.get(projectId, organizationId);
  }

  async renderShot(projectId: string, shotId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertPlan(project.childrenClipPlan?.status);
    const shot = project.childrenClipShots.find((item) => item.id === shotId);
    if (!shot) throw new NotFoundException('Tomada nao encontrada');
    if (shot.renderMode === 'wan') throw new BadRequestException('Tomadas Wan usam a etapa de tomadas especiais');
    if (!shot.assets.some((asset) => asset.role === 'background' && asset.status === 'approved')) {
      throw new BadRequestException('Aprove o fundo desta tomada antes de renderizar');
    }
    if (shot.renderAttempts[0] && ['queued', 'rendering'].includes(shot.renderAttempts[0].status)) {
      throw new BadRequestException('A tomada ja esta sendo renderizada');
    }
    await this.createAttempt(project, shotId, organizationId, userId);
    return this.get(projectId, organizationId);
  }

  async retry(projectId: string, attemptId: string, organizationId: string, userId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const attempt = await this.prisma.childrenClipShotRenderAttempt.findFirst({ where: { id: attemptId, shot: { projectId } } });
    if (!attempt) throw new NotFoundException('Tentativa de render nao encontrada');
    if (attempt.status !== 'failed') throw new BadRequestException('Somente uma tentativa com falha pode ser reenfileirada');
    await this.createAttempt(project, attempt.shotId, organizationId, userId);
    return this.get(projectId, organizationId);
  }

  async getDownload(projectId: string, attemptId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);
    const attempt = await this.prisma.childrenClipShotRenderAttempt.findFirst({
      where: { id: attemptId, shot: { projectId } }, include: { asset: true, shot: true }
    });
    if (!attempt?.asset) throw new NotFoundException('Video da tomada nao encontrado');
    return {
      absolutePath: this.storage.getAbsolutePath(attempt.asset.storagePath), mimeType: attempt.asset.mimeType,
      fileName: `tomada-${attempt.shot.index + 1}-2d.mp4`
    };
  }

  private async createAttempt(
    project: Awaited<ReturnType<ChildrenClipAnimationService['getOwnedProject']>>,
    shotId: string, organizationId: string, userId: string
  ) {
    const shot = project.childrenClipShots.find((item) => item.id === shotId)!;
    const attemptNumber = (await this.prisma.childrenClipShotRenderAttempt.aggregate({ where: { shotId }, _max: { attemptNumber: true } }))._max.attemptNumber ?? 0;
    const fps = project.generationFps || 24;
    const dimensions = project.childrenClip?.aspectRatio === 'portrait_9_16'
      ? { width: 720, height: 1280 }
      : project.childrenClip?.aspectRatio === 'square_1_1'
        ? { width: 1080, height: 1080 }
        : { width: 1280, height: 720 };
    const attempt = await this.prisma.childrenClipShotRenderAttempt.create({
      data: { shotId, attemptNumber: attemptNumber + 1, status: 'queued', fps, ...dimensions, frameCount: Math.max(1, Math.round(shot.durationSeconds * fps)), stage: 'QUEUED' }
    });
    const queued = await this.queue.enqueueShotRender({ projectId: project.id, organizationId, requestedByUserId: userId, renderAttemptId: attempt.id });
    await this.prisma.$transaction([
      this.prisma.childrenClipShotRenderAttempt.update({ where: { id: attempt.id }, data: { bullJobId: queued.bullJobId } }),
      this.prisma.processingJob.create({
        data: {
          projectId: project.id, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_SHOT_RENDER_JOB_NAME,
          bullJobId: queued.bullJobId, status: ProcessingJobStatus.queued, progress: 0,
          detailMessage: `Render 2D da tomada ${shot.index + 1} enfileirado.`,
          activityLog: [{ stage: 'QUEUED', message: `Render 2D da tomada ${shot.index + 1} enfileirado.`, renderAttemptId: attempt.id, progress: 0, timestamp: new Date().toISOString() }]
        }
      })
    ]);
  }

  private presentAttempt(attempt: Awaited<ReturnType<ChildrenClipAnimationService['getOwnedProject']>>['childrenClipShots'][number]['renderAttempts'][number]) {
    return {
      id: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status, progress: attempt.progress,
      stage: attempt.stage, errorMessage: attempt.errorMessage, fps: attempt.fps, width: attempt.width,
      height: attempt.height, frameCount: attempt.frameCount, renderManifest: attempt.renderManifest,
      hasVideo: Boolean(attempt.assetId), createdAt: attempt.createdAt, renderStartedAt: attempt.renderStartedAt,
      renderCompletedAt: attempt.renderCompletedAt
    };
  }

  private assertPlan(status: string | undefined) {
    if (status !== 'approved') throw new BadRequestException('Aprove o plano de producao antes de animar');
  }

  private async getOwnedProject(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null },
      include: {
        childrenClip: true, childrenClipPlan: true,
        childrenClipShots: {
          orderBy: { index: 'asc' },
          include: { assets: true, renderAttempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } }
        }
      }
    });
    if (!project?.childrenClip) throw new NotFoundException('Projeto de clipe infantil nao encontrado');
    return project;
  }
}
