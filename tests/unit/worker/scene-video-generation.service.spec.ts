import { describe, expect, it, vi } from 'vitest';

import { SceneVideoGenerationService } from '../../../apps/worker/src/services/scene-video-generation.service';

describe('SceneVideoGenerationService', () => {
  it('delegates scene video generation to the ComfyUI client', async () => {
    const generateVideo = vi.fn().mockResolvedValue(Buffer.from('video-bytes'));
    const service = new SceneVideoGenerationService({
      generateVideo
    } as never);

    const result = await service.generate({
      sceneId: 'scene-1',
      positivePrompt: 'cowboy riding a horse at sunset',
      negativePrompt: 'blurry, low quality',
      width: 1280,
      height: 704,
      durationSeconds: 5
    });

    expect(result).toEqual(Buffer.from('video-bytes'));
    expect(generateVideo).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      positivePrompt: 'cowboy riding a horse at sunset',
      negativePrompt: 'blurry, low quality',
      width: 1280,
      height: 704,
      durationSeconds: 5
    });
  });
});
