import { Inject, Injectable } from '@nestjs/common';

import { ComfyUiClientService } from './comfyui-client.service';

interface SceneVideoInput {
  sceneId: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  durationSeconds: number;
}

@Injectable()
export class SceneVideoGenerationService {
  constructor(
    @Inject(ComfyUiClientService)
    private readonly comfyUiClientService: ComfyUiClientService
  ) {}

  async generate(input: SceneVideoInput): Promise<Buffer | null> {
    return this.comfyUiClientService.generateVideo({
      sceneId: input.sceneId,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt,
      width: input.width,
      height: input.height,
      durationSeconds: input.durationSeconds
    });
  }
}
