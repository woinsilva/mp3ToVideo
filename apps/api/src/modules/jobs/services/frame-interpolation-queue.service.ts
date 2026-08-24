import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FRAME_INTERPOLATION_JOB_NAME,
  FRAME_INTERPOLATION_QUEUE_NAME,
  type FrameInterpolationJobPayload
} from '@video/shared';
import { Queue, type ConnectionOptions } from 'bullmq';

@Injectable()
export class FrameInterpolationQueueService implements OnModuleDestroy {
  private readonly queue: Queue<FrameInterpolationJobPayload>;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const connection: ConnectionOptions = {
      host: configService.get<string>('redis.host', 'localhost'),
      port: configService.get<number>('redis.port', 6379)
    };
    this.queue = new Queue(FRAME_INTERPOLATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 }
    });
  }

  async enqueue(payload: FrameInterpolationJobPayload, jobId: string) {
    const job = await this.queue.add(FRAME_INTERPOLATION_JOB_NAME, payload, { jobId });
    return { bullJobId: String(job.id) };
  }

  async inspect(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    return {
      state: await job.getState(),
      progress: job.progress,
      failedReason: job.failedReason || null,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null
    };
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
