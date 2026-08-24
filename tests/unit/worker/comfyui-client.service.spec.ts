import { describe, expect, it, vi } from 'vitest';

import { ComfyUiClientService } from '../../../apps/worker/src/services/comfyui-client.service';

describe('ComfyUiClientService', () => {
  it('builds an img2img workflow when a character reference is supplied', async () => {
    const config = { get: vi.fn((key: string, fallback: unknown) => ({
      'visual.provider': 'comfyui'
    } as Record<string, unknown>)[key] ?? fallback) };
    const gpu = { withLease: vi.fn((_label, operation) => operation()) };
    const service = new ComfyUiClientService(config as never, {} as never, gpu as never) as any;
    service.uploadInputImage = vi.fn().mockResolvedValue('reference.png');
    service.submitWorkflow = vi.fn().mockResolvedValue('prompt-1');
    service.waitForHistory = vi.fn().mockResolvedValue({ outputs: { '9': { images: [{ filename: 'result.png' }] } } });
    service.downloadAsset = vi.fn().mockResolvedValue(Buffer.from('png'));

    await service.generateStillImage({
      positivePrompt: 'same rabbit, side pose', negativePrompt: 'different identity', checkpointName: 'sdxl.safetensors',
      width: 1024, height: 1024, steps: 30, cfg: 6.5, sampler: 'dpmpp_2m', scheduler: 'karras', seed: 42,
      filenamePrefix: 'character-side', referenceImagePath: 'C:/reference.png', denoise: 0.4
    });

    const workflow = service.submitWorkflow.mock.calls[0][0];
    expect(workflow['5']).toMatchObject({ class_type: 'VAEEncode' });
    expect(workflow['11']).toMatchObject({ class_type: 'LoadImage', inputs: { image: 'reference.png' } });
    expect(workflow['12']).toMatchObject({ class_type: 'ImageScale', inputs: { width: 1024, height: 1024 } });
    expect(workflow['3'].inputs).toMatchObject({ denoise: 0.4, latent_image: ['5', 0] });
  });

  it('accepts SaveVideo outputs that store the mp4 asset under images', () => {
    const service = new ComfyUiClientService(
      {
        get: vi.fn()
      } as never,
      {} as never,
      {} as never
    ) as unknown as {
      extractOutputAsset: (
        entry: Record<string, unknown>,
        preferredKinds: Array<'images' | 'videos' | 'gifs' | 'animated'>,
        options?: { allowImageVideoExtensionFallback?: boolean }
      ) => { filename: string; subfolder?: string; type?: string } | null;
    };

    const asset = service.extractOutputAsset(
      {
        outputs: {
          '58': {
            images: [
              {
                filename: 'scene-123.mp4',
                subfolder: 'video',
                type: 'output'
              }
            ],
            animated: [true]
          }
        }
      },
      ['videos', 'animated', 'gifs'],
      {
        allowImageVideoExtensionFallback: true
      }
    );

    expect(asset).toEqual({
      filename: 'scene-123.mp4',
      subfolder: 'video',
      type: 'output'
    });
  });

  it('ignores boolean animated flags without treating them as assets', () => {
    const service = new ComfyUiClientService(
      {
        get: vi.fn()
      } as never,
      {} as never,
      {} as never
    ) as unknown as {
      extractOutputAsset: (
        entry: Record<string, unknown>,
        preferredKinds: Array<'images' | 'videos' | 'gifs' | 'animated'>,
        options?: { allowImageVideoExtensionFallback?: boolean }
      ) => { filename: string; subfolder?: string; type?: string } | null;
    };

    const asset = service.extractOutputAsset(
      {
        outputs: {
          '58': {
            animated: [true]
          }
        }
      },
      ['videos', 'animated', 'gifs'],
      {
        allowImageVideoExtensionFallback: true
      }
    );

    expect(asset).toBeNull();
  });
});
