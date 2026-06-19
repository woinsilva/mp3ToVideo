import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PROJECT_PROCESS_JOB_NAME,
  PROJECT_QUEUE_NAME,
  type ProjectProcessingJobPayload
} from '@video/shared';
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

@Injectable()
export class ProjectProcessingQueueService implements OnModuleDestroy {
  private readonly connection: ConnectionOptions;
  private readonly queue: Queue<ProjectProcessingJobPayload>;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {
    this.connection = {
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379)
    };

    this.queue = new Queue<ProjectProcessingJobPayload>(PROJECT_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100
      }
    });
  }

  async enqueue(payload: ProjectProcessingJobPayload): Promise<{ bullJobId: string }> {
    const job = await this.queue.add(PROJECT_PROCESS_JOB_NAME, payload);

    return {
      bullJobId: String(job.id)
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
