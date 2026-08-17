import { Inject, Injectable } from '@nestjs/common';

import type { ComfyUiGenerationResult, ComfyUiHeartbeat } from './comfyui-client.service';
import { ComfyUiClientService } from './comfyui-client.service';
import type { ResolvedVideoGenerationSettings } from './video-generation-settings.service';

interface SceneVideoInput extends ResolvedVideoGenerationSettings {
  sceneId: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  referenceImagePath?: string | null;
  onSubmitted?: (promptId: string) => Promise<void>;
  onHeartbeat?: (heartbeat: ComfyUiHeartbeat) => Promise<void>;
  shouldCancel?: () => Promise<boolean>;
}

export interface SceneVideoResult {
  buffer: Buffer;
  provider: 'comfyui-video';
}

@Injectable()
export class SceneVideoGenerationService {
  constructor(
    @Inject(ComfyUiClientService)
    private readonly comfyUiClientService: ComfyUiClientService
  ) {}

  async generate(input: SceneVideoInput): Promise<SceneVideoResult | null> {
    const result: ComfyUiGenerationResult | null =
      await this.comfyUiClientService.generateVideo({
        sceneId: input.sceneId,
        positivePrompt: input.positivePrompt,
        negativePrompt: input.negativePrompt,
        width: input.width,
        height: input.height,
        durationSeconds: input.durationSeconds,
        frameCount: input.frameCount,
        fps: input.fps,
        seed: input.seed,
        steps: input.steps,
        cfg: input.cfg,
        sampler: input.sampler,
        scheduler: input.scheduler,
        unetName: input.unetName,
        clipName: input.clipName,
        clipType: input.clipType,
        vaeName: input.vaeName,
        modelShift: input.modelShift,
        referenceImagePath: input.referenceImagePath,
        onSubmitted: input.onSubmitted,
        onHeartbeat: input.onHeartbeat,
        shouldCancel: input.shouldCancel
      });

    if (!result) {
      return null;
    }

    return {
      buffer: result.buffer,
      provider: 'comfyui-video'
    };
  }
}
