import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FRAME_INTERPOLATION_QUEUE_NAME, type FrameInterpolationJobPayload } from '@video/shared';
import { Worker, type ConnectionOptions } from 'bullmq';

import { FrameInterpolationProcessor } from '../processors/frame-interpolation.processor';

@Injectable()
export class FrameInterpolationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FrameInterpolationWorkerService.name);
  private readonly worker: Worker<FrameInterpolationJobPayload>;

  constructor(config: ConfigService, @Inject(FrameInterpolationProcessor) processor: FrameInterpolationProcessor) {
    const connection: ConnectionOptions = {
      host: config.get<string>('redis.host', 'localhost'),
      port: config.get<number>('redis.port', 6379)
    };
    this.worker = new Worker(FRAME_INTERPOLATION_QUEUE_NAME, (job) => processor.process(job), {
      connection,
      concurrency: 1,
      lockDuration: config.get<number>('worker.lockDurationMs', 1800000),
      stalledInterval: config.get<number>('worker.stalledIntervalMs', 30000)
    });
  }

  async onModuleInit() {
    this.worker.on('completed', (job) => this.logger.log(`Interpolation job ${String(job.id)} completed`));
    this.worker.on('failed', (job, error) => this.logger.error(`Interpolation job ${job ? String(job.id) : 'unknown'} failed: ${error.message}`));
    await this.worker.waitUntilReady();
    this.logger.log(`BullMQ worker listening on queue ${FRAME_INTERPOLATION_QUEUE_NAME}`);
  }

  async onModuleDestroy() { await this.worker.close(); }
}
