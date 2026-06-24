import { stat, writeFile } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import type { ComfyUiGenerationResult } from './comfyui-client.service';
import { ComfyUiClientService } from './comfyui-client.service';
import { RenderStorageService } from './render-storage.service';

interface SceneImageInput {
  organizationId: string;
  projectId: string;
  sceneIndex: number;
  sceneTitle: string;
  positivePrompt: string;
  negativePrompt: string;
  style: string;
  camera: string;
}

export interface SceneImageResult {
  storagePath: string;
  sizeBytes: number;
  provider: 'comfyui-image';
}

@Injectable()
export class SceneImageGenerationService {
  constructor(
    @Inject(ComfyUiClientService)
    private readonly comfyUiClientService: ComfyUiClientService,
    @Inject(RenderStorageService)
    private readonly renderStorageService: RenderStorageService
  ) {}

  async generate(input: SceneImageInput): Promise<SceneImageResult | null> {
    const result: ComfyUiGenerationResult | null =
      await this.comfyUiClientService.generateImage(
        [
          input.positivePrompt,
          `style: ${input.style}`,
          `camera: ${input.camera}`,
          `scene title: ${input.sceneTitle}`
        ].join(', '),
        input.negativePrompt
      );

    if (!result) {
      return null;
    }

    const storagePath = this.renderStorageService.buildSceneImagePath(
      input.organizationId,
      input.projectId,
      input.sceneIndex
    );
    const absolutePath = await this.renderStorageService.ensureParentDirectory(storagePath);

    await writeFile(absolutePath, result.buffer);

    return {
      storagePath,
      sizeBytes: Number((await stat(absolutePath)).size),
      provider: 'comfyui-image'
    };
  }
}
