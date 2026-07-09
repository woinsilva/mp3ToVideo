import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PROJECT_QUEUE_NAME,
  type ProjectProcessingJobPayload
} from '@video/shared';
import { Worker, type ConnectionOptions } from 'bullmq';

import { ProjectProcessor } from '../processors/project.processor';

@Injectable()
export class ProjectProcessingWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectProcessingWorkerService.name);
  private readonly connection: ConnectionOptions;
  private readonly worker: Worker<ProjectProcessingJobPayload>;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(ProjectProcessor)
    private readonly projectProcessor: ProjectProcessor
  ) {
    this.connection = {
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379)
    };

    this.worker = new Worker<ProjectProcessingJobPayload>(
      PROJECT_QUEUE_NAME,
      async (job) => this.projectProcessor.process(job),
      {
        connection: this.connection,
        lockDuration: this.configService.get<number>('worker.lockDurationMs', 1800000),
        stalledInterval: this.configService.get<number>('worker.stalledIntervalMs', 30000)
      }
    );
  }

  async onModuleInit(): Promise<void> {
    this.worker.on('completed', (job) => {
      this.logger.log(`Processed job ${String(job.id)} for project ${job.data.projectId}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Failed job ${job ? String(job.id) : 'unknown'}: ${error.message}`
      );
    });

    await this.worker.waitUntilReady();
    this.logger.log(`BullMQ worker listening on queue ${PROJECT_QUEUE_NAME}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
