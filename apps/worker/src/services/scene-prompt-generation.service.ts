import { Inject, Injectable } from '@nestjs/common';

import { OllamaClientService } from './ollama-client.service';
import type { PlannedScene } from './scene-planning.service';
import {
  ScenePromptDraft,
  ScenePromptService
} from './scene-prompt.service';
import type { StoryboardDraft } from './storyboard-fallback.service';

interface ScenePromptOllamaResponse {
  positivePrompt?: string;
  negativePrompt?: string;
  style?: string;
  camera?: string;
}

@Injectable()
export class ScenePromptGenerationService {
  constructor(
    @Inject(OllamaClientService)
    private readonly ollamaClientService: OllamaClientService,
    @Inject(ScenePromptService)
    private readonly scenePromptService: ScenePromptService
  ) {}

  async build(scene: PlannedScene, storyboard: StoryboardDraft): Promise<ScenePromptDraft> {
    const fallback = this.scenePromptService.build(scene, storyboard);
    const generated = await this.ollamaClientService.generateJson<ScenePromptOllamaResponse>([
      {
        role: 'system',
        content: [
          'You generate concise cinematic prompts for short AI video clips.',
          'Return only valid JSON.',
          'Use these exact keys: positivePrompt, negativePrompt, style, camera.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          storyboard,
          scene
        })
      }
    ]);

    if (
      generated?.positivePrompt &&
      generated.negativePrompt &&
      generated.style &&
      generated.camera
    ) {
      return {
        provider: this.ollamaClientService.isEnabled() ? 'ollama' : fallback.provider,
        positivePrompt: generated.positivePrompt.trim(),
        negativePrompt: generated.negativePrompt.trim(),
        style: generated.style.trim(),
        camera: generated.camera.trim()
      };
    }

    return fallback;
  }
}
