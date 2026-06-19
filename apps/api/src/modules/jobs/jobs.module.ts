import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProjectProcessingPayloadFactory } from './services/project-processing-payload.factory';
import { ProjectProcessingQueueService } from './services/project-processing-queue.service';

@Module({
  imports: [ConfigModule],
  providers: [ProjectProcessingPayloadFactory, ProjectProcessingQueueService],
  exports: [ProjectProcessingPayloadFactory, ProjectProcessingQueueService]
})
export class JobsModule {}
