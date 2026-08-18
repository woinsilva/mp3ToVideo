import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  FRAME_INTERPOLATION_JOB_NAME,
  FRAME_INTERPOLATION_QUEUE_NAME,
  type FrameInterpolationJobPayload
} from '@video/shared';
import { Queue, type ConnectionOptions } from 'bullmq';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class FrameInterpolationSchedulerService implements OnModuleDestroy {
  private readonly queue: Queue<FrameInterpolationJobPayload>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService
  ) {
    const connection: ConnectionOptions = {
      host: config.get<string>('redis.host', 'localhost'),
      port: config.get<number>('redis.port', 6379)
    };
    this.queue = new Queue(FRAME_INTERPOLATION_QUEUE_NAME, { connection });
  }

  async scheduleIfEnabled(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.frameInterpolationMode !== 'rife_2x') return;

    const render = await this.prisma.render.findFirst({
      where: { projectId, status: 'completed', assetId: { not: null } },
      include: { asset: true },
      orderBy: { updatedAt: 'desc' }
    });
    if (!render?.asset) throw new Error('Cannot schedule RIFE: completed original render not found');

    const existing = await this.prisma.processingJob.findFirst({
      where: {
        projectId,
        queueName: FRAME_INTERPOLATION_QUEUE_NAME,
        status: { in: ['queued', 'active', 'retrying', 'completed'] }
      }
    });
    if (existing) return;

    const job = await this.prisma.processingJob.create({
      data: {
        projectId,
        queueName: FRAME_INTERPOLATION_QUEUE_NAME,
        jobName: FRAME_INTERPOLATION_JOB_NAME,
        status: 'queued',
        progress: 0,
        detailMessage: 'Interpolacao RIFE 2x automatica enfileirada.',
        activityLog: [{
          stage: 'queued', message: 'Interpolacao RIFE 2x automatica enfileirada.',
          provider: 'rife-ncnn-vulkan', progress: 0, timestamp: new Date().toISOString()
        }] satisfies Prisma.InputJsonValue
      }
    });
    try {
      const queued = await this.queue.add(FRAME_INTERPOLATION_JOB_NAME, {
        projectId,
        organizationId: project.organizationId,
        sourceAssetId: render.asset.id
      }, { jobId: job.id });
      await this.prisma.processingJob.update({ where: { id: job.id }, data: { bullJobId: String(queued.id) } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue error';
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: { status: 'failed', errorMessage: message, detailMessage: `Falha ao enfileirar interpolacao: ${message}` }
      });
      throw error;
    }
  }

  async onModuleDestroy() { await this.queue.close(); }
}
