import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME,
  CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME,
  CHILDREN_CLIP_QUEUE_NAME,
  type ChildrenClipCharacterGenerationJobPayload
} from '@video/shared';
import { Worker, type ConnectionOptions } from 'bullmq';

import { ChildrenClipProcessor } from '../processors/children-clip.processor';

@Injectable()
export class ChildrenClipWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChildrenClipWorkerService.name);
  private readonly worker: Worker<ChildrenClipCharacterGenerationJobPayload>;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(ChildrenClipProcessor) private readonly processor: ChildrenClipProcessor
  ) {
    const connection: ConnectionOptions = {
      host: config.get<string>('redis.host', 'localhost'),
      port: config.get<number>('redis.port', 6379)
    };
    this.worker = new Worker<ChildrenClipCharacterGenerationJobPayload>(
      CHILDREN_CLIP_QUEUE_NAME,
      async (job) => {
        if (job.name === CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME) {
          return this.processor.processCharacterGeneration(job);
        }
        if (job.name === CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME) {
          return this.processor.processAudioAnalysis(job);
        }
        throw new Error(`Unsupported children clip job: ${job.name}`);
      },
      {
        connection,
        concurrency: 1,
        lockDuration: config.get<number>('worker.lockDurationMs', 1800000),
        stalledInterval: config.get<number>('worker.stalledIntervalMs', 30000)
      }
    );
  }

  async onModuleInit() {
    this.worker.on('completed', (job) => this.logger.log(`Completed ${job.name} job=${String(job.id)}`));
    this.worker.on('failed', (job, error) => this.logger.error(`Failed ${job?.name ?? 'unknown'} job=${String(job?.id ?? 'unknown')}: ${error.message}`));
    await this.worker.waitUntilReady();
    this.logger.log(`BullMQ worker listening on queue ${CHILDREN_CLIP_QUEUE_NAME}`);
  }

  async onModuleDestroy() {
    await this.worker.close();
  }
}
