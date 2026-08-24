import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME,
  CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME,
  CHILDREN_CLIP_PLAN_GENERATE_JOB_NAME,
  CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME,
  CHILDREN_CLIP_QUEUE_NAME,
  type ChildrenClipAudioAnalysisJobPayload,
  type ChildrenClipPlanGenerationJobPayload,
  type ChildrenClipAssetGenerationJobPayload,
  type ChildrenClipCharacterGenerationJobPayload
} from '@video/shared';
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

@Injectable()
export class ChildrenClipQueueService implements OnModuleDestroy {
  private readonly queue: Queue<ChildrenClipCharacterGenerationJobPayload | ChildrenClipAudioAnalysisJobPayload | ChildrenClipPlanGenerationJobPayload | ChildrenClipAssetGenerationJobPayload>;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const connection: ConnectionOptions = {
      host: configService.get<string>('redis.host', 'localhost'),
      port: configService.get<number>('redis.port', 6379)
    };

    this.queue = new Queue(CHILDREN_CLIP_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 200
      }
    });
  }

  async enqueueCharacterGeneration(
    payload: ChildrenClipCharacterGenerationJobPayload
  ): Promise<{ bullJobId: string }> {
    const job = await this.queue.add(CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME, payload, {
      jobId: `character-${payload.characterVersionId}-${Date.now()}`,
      delay: 500
    });

    return { bullJobId: String(job.id) };
  }

  async enqueueAudioAnalysis(
    payload: ChildrenClipAudioAnalysisJobPayload
  ): Promise<{ bullJobId: string }> {
    const job = await this.queue.add(CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME, payload, {
      jobId: `audio-${payload.projectId}-${Date.now()}`,
      delay: 500
    });

    return { bullJobId: String(job.id) };
  }

  async enqueueProductionPlan(
    payload: ChildrenClipPlanGenerationJobPayload
  ): Promise<{ bullJobId: string }> {
    const job = await this.queue.add(CHILDREN_CLIP_PLAN_GENERATE_JOB_NAME, payload, {
      jobId: `plan-${payload.projectId}-${Date.now()}`,
      delay: 500
    });
    return { bullJobId: String(job.id) };
  }

  async enqueueShotAsset(
    payload: ChildrenClipAssetGenerationJobPayload
  ): Promise<{ bullJobId: string }> {
    const job = await this.queue.add(CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME, payload, {
      jobId: `asset-${payload.shotAssetId}-${Date.now()}`,
      delay: 500
    });
    return { bullJobId: String(job.id) };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
