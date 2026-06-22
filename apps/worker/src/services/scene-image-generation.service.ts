import { stat, writeFile } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

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

interface SceneImageResult {
  storagePath: string;
  sizeBytes: number;
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
    const imageBuffer = await this.comfyUiClientService.generateImage(
      [
        input.positivePrompt,
        `style: ${input.style}`,
        `camera: ${input.camera}`,
        `scene title: ${input.sceneTitle}`
      ].join(', '),
      input.negativePrompt
    );

    if (!imageBuffer) {
      return null;
    }

    const storagePath = this.renderStorageService.buildSceneImagePath(
      input.organizationId,
      input.projectId,
      input.sceneIndex
    );
    const absolutePath = await this.renderStorageService.ensureParentDirectory(storagePath);

    await writeFile(absolutePath, imageBuffer);

    return {
      storagePath,
      sizeBytes: Number((await stat(absolutePath)).size)
    };
  }
}
