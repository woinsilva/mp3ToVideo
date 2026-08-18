import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProcessingJobStatus, type Prisma } from '@prisma/client';
import type { FrameInterpolationJobPayload } from '@video/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { FrameInterpolationService } from '../services/frame-interpolation.service';

@Injectable()
export class FrameInterpolationProcessor {
  private readonly logger = new Logger(FrameInterpolationProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FrameInterpolationService) private readonly interpolation: FrameInterpolationService
  ) {}

  async process(job: Job<FrameInterpolationJobPayload>): Promise<void> {
    const id = String(job.id);
    try {
      await this.update(job, ProcessingJobStatus.active, 'STARTING', 5, 'Worker iniciou a interpolacao RIFE 2x.');
      const asset = await this.interpolation.interpolate({
        jobId: id,
        ...job.data,
        onProgress: (stage, progress, message) =>
          this.update(job, ProcessingJobStatus.active, stage, progress, message)
      });
      await this.update(
        job,
        ProcessingJobStatus.completed,
        'COMPLETED',
        100,
        `Interpolacao concluida. Asset ${asset.id} pronto.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown RIFE error';
      await this.reconcileFailure(job, message);
      throw error;
    }
  }

  async reconcileFailure(
    job: Pick<Job<FrameInterpolationJobPayload>, 'id' | 'progress' | 'updateProgress'>,
    message: string
  ): Promise<void> {
    const id = String(job.id);
    this.logger.error(`[${id}] FAILED: ${message}`);
    try {
      const current = await this.prisma.processingJob.findUnique({ where: { id } });
      if (current?.status === ProcessingJobStatus.failed && current.errorMessage === message) return;
      await this.update(
        job,
        ProcessingJobStatus.failed,
        'FAILED',
        undefined,
        `Falha na interpolacao: ${message}`,
        message
      );
    } catch (persistenceError) {
      const persistenceMessage = persistenceError instanceof Error
        ? persistenceError.message
        : 'Unknown persistence error';
      this.logger.error(`[${id}] Could not persist FAILED state: ${persistenceMessage}`);
    }
  }

  private async update(
    job: Pick<Job<FrameInterpolationJobPayload>, 'id' | 'progress' | 'updateProgress'>,
    status: ProcessingJobStatus,
    stage: string,
    progress: number | undefined,
    detailMessage: string,
    errorMessage: string | null = null
  ) {
    const id = String(job.id);
    const current = await this.prisma.processingJob.findUnique({ where: { id } });
    if (!current) throw new Error(`Interpolation processing job ${id} not found`);
    const effectiveProgress = progress ?? current.progress;
    const log = Array.isArray(current.activityLog) ? [...current.activityLog] : [];
    log.push({
      stage,
      message: detailMessage,
      provider: 'rife-ncnn-vulkan',
      progress: effectiveProgress,
      timestamp: new Date().toISOString()
    });
    this.logger.log(`[${id}] ${stage} ${effectiveProgress}%: ${detailMessage}`);
    await this.prisma.processingJob.update({
      where: { id },
      data: {
        status,
        progress: effectiveProgress,
        detailMessage,
        errorMessage,
        activityLog: log.slice(-200) as Prisma.InputJsonValue
      }
    });
    await job.updateProgress({
      percent: effectiveProgress,
      stage,
      message: detailMessage,
      updatedAt: new Date().toISOString()
    });
  }
}
