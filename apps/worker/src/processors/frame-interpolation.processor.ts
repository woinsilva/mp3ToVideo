import { Inject, Injectable } from '@nestjs/common';
import { ProcessingJobStatus, type Prisma } from '@prisma/client';
import type { FrameInterpolationJobPayload } from '@video/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { FrameInterpolationService } from '../services/frame-interpolation.service';

@Injectable()
export class FrameInterpolationProcessor {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FrameInterpolationService) private readonly interpolation: FrameInterpolationService
  ) {}

  async process(job: Pick<Job<FrameInterpolationJobPayload>, 'id' | 'data'>): Promise<void> {
    const id = String(job.id);
    await this.update(id, ProcessingJobStatus.active, 5, 'Worker iniciou a interpolacao RIFE 2x.');
    try {
      const asset = await this.interpolation.interpolate({
        jobId: id,
        ...job.data,
        onProgress: (progress, message) => this.update(id, ProcessingJobStatus.active, progress, message)
      });
      await this.update(id, ProcessingJobStatus.completed, 100, `Interpolacao concluida. Asset ${asset.id} pronto.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown RIFE error';
      await this.update(id, ProcessingJobStatus.failed, undefined, `Falha na interpolacao: ${message}`, message);
      throw error;
    }
  }

  private async update(bullJobId: string, status: ProcessingJobStatus, progress: number | undefined, detailMessage: string, errorMessage: string | null = null) {
    const current = await this.prisma.processingJob.findFirst({ where: { bullJobId } });
    if (!current) throw new Error(`Interpolation processing job ${bullJobId} not found`);
    const log = Array.isArray(current.activityLog) ? [...current.activityLog] : [];
    log.push({
      stage: status,
      message: detailMessage,
      provider: 'rife-ncnn-vulkan',
      progress: progress ?? current.progress,
      timestamp: new Date().toISOString()
    });
    await this.prisma.processingJob.update({
      where: { id: current.id },
      data: {
        status,
        progress: progress ?? current.progress,
        detailMessage,
        errorMessage,
        activityLog: log.slice(-200) as Prisma.InputJsonValue
      }
    });
  }
}
