import { describe, expect, it, vi } from 'vitest';

import { SceneVideoGenerationService } from '../../../apps/worker/src/services/scene-video-generation.service';

describe('SceneVideoGenerationService', () => {
  it('delegates scene video generation to the ComfyUI client', async () => {
    const generateVideo = vi.fn().mockResolvedValue({ buffer: Buffer.from('video-bytes'), provider: 'comfyui-video' });
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

    expect(result).toEqual({ buffer: Buffer.from('video-bytes'), provider: 'comfyui-video' });
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
