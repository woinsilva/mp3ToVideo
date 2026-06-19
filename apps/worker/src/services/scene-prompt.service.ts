import { Injectable } from '@nestjs/common';

import type { PlannedScene } from './scene-planning.service';
import type { StoryboardDraft } from './storyboard-fallback.service';

export interface ScenePromptDraft {
  provider: string;
  positivePrompt: string;
  negativePrompt: string;
  style: string;
  camera: string;
}

@Injectable()
export class ScenePromptService {
  build(scene: PlannedScene, storyboard: StoryboardDraft): ScenePromptDraft {
    return {
      provider: 'mock',
      positivePrompt: [
        storyboard.visualStyle,
        storyboard.mood,
        storyboard.colorPalette,
        scene.title,
        scene.description
      ].join(', '),
      negativePrompt: 'blurry, distorted, low resolution, extra limbs, duplicated subjects',
      style: storyboard.visualStyle,
      camera: this.resolveCamera(scene)
    };
  }

  private resolveCamera(scene: PlannedScene): string {
    if (scene.sectionType === 'chorus') {
      return 'dynamic tracking shot';
    }

    if (scene.sectionType === 'bridge') {
      return 'slow circular dolly shot';
    }

    return 'cinematic medium shot';
  }
}
