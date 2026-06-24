import { Inject, Injectable } from '@nestjs/common';

import type { ComfyUiGenerationResult } from './comfyui-client.service';
import { ComfyUiClientService } from './comfyui-client.service';

interface SceneVideoInput {
  sceneId: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  durationSeconds: number;
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
        durationSeconds: input.durationSeconds
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
