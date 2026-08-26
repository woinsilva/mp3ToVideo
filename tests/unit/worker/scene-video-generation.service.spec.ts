import { describe, expect, it, vi } from 'vitest';

import { SceneVideoGenerationService } from '../../../apps/worker/src/services/scene-video-generation.service';

describe('SceneVideoGenerationService', () => {
  it('delegates scene video generation to the ComfyUI client', async () => {
    const generateVideo = vi.fn().mockResolvedValue({ buffer: Buffer.from('video-bytes'), provider: 'comfyui-video' });
    const service = new SceneVideoGenerationService({ generateVideo } as never, {} as never, {} as never);

    const result = await service.generate({
      sceneId: 'scene-1',
      positivePrompt: 'cowboy riding a horse at sunset',
      negativePrompt: 'blurry, low quality',
      width: 1280,
      height: 704,
      durationSeconds: 5
    });

    expect(result).toEqual({ buffer: Buffer.from('video-bytes'), provider: 'comfyui-video' });
    expect(generateVideo).toHaveBeenCalledWith(expect.objectContaining({
      sceneId: 'scene-1',
      positivePrompt: 'cowboy riding a horse at sunset',
      negativePrompt: 'blurry, low quality',
      width: 1280,
      height: 704,
      durationSeconds: 5
    }));
  });

  it('runs SnapGen without invoking ComfyUI and reports external metadata', async () => {
    const generateVideo = vi.fn();
    const snapgen = {
      withGenerationSlot: vi.fn((operation) => operation()),
      submitVideoGeneration: vi.fn().mockResolvedValue({ uuid: 'external-1', model_name: 'veo-3.1-fast', estimated_credit: 4, status: 0 }),
      getHistory: vi.fn().mockResolvedValue({ status: 2, status_percentage: 100, used_credit: 4, generated_video: [{ video_url: 'https://signed.test/video', duration: 8, resolution: '720p', aspect_ratio: '16:9' }] }),
      download: vi.fn().mockResolvedValue({ buffer: Buffer.from('cloud-video'), mimeType: 'video/mp4' })
    };
    const heartbeat = vi.fn();
    const service = new SceneVideoGenerationService({ generateVideo } as never, snapgen as never, { get: vi.fn((_key, fallback) => fallback) } as never);
    const result = await service.generate({
      sceneId: 'shot-1', provider: 'snapgen', positivePrompt: 'subtle train motion', negativePrompt: '', width: 1280, height: 720, durationSeconds: 8,
      snapGenSettings: { model: 'veo-3.1-fast', resolution: '720p', durationSeconds: 8, aspectRatio: '16:9', modeImage: 'frame', referenceImagePaths: ['C:/frame.png'] }, onHeartbeat: heartbeat
    });
    expect(generateVideo).not.toHaveBeenCalled();
    expect(snapgen.submitVideoGeneration).toHaveBeenCalledWith(expect.objectContaining({ mode_image: 'frame', ref_images: ['C:/frame.png'] }));
    expect(result).toMatchObject({ buffer: Buffer.from('cloud-video'), provider: 'snapgen', metadata: { estimatedCredit: 4, usedCredit: 4 } });
    expect(heartbeat).toHaveBeenCalledWith(expect.objectContaining({ statusPercentage: 100, externalStatus: 2 }));
  });
});
