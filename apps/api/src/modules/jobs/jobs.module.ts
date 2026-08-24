import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProjectProcessingPayloadFactory } from './services/project-processing-payload.factory';
import { ProjectProcessingQueueService } from './services/project-processing-queue.service';
import { FrameInterpolationQueueService } from './services/frame-interpolation-queue.service';
import { ChildrenClipQueueService } from './services/children-clip-queue.service';

@Module({
  imports: [ConfigModule],
  providers: [ChildrenClipQueueService, FrameInterpolationQueueService, ProjectProcessingPayloadFactory, ProjectProcessingQueueService],
  exports: [ChildrenClipQueueService, FrameInterpolationQueueService, ProjectProcessingPayloadFactory, ProjectProcessingQueueService]
})
export class JobsModule {}
