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

  it('chains regional IPAdapter references with separate masks', async () => {
    const config = { get: vi.fn((key: string, fallback: unknown) => ({
      'visual.provider': 'comfyui'
    } as Record<string, unknown>)[key] ?? fallback) };
    const gpu = { withLease: vi.fn((_label, operation) => operation()) };
    const service = new ComfyUiClientService(config as never, {} as never, gpu as never) as any;
    service.uploadInputImage = vi.fn()
      .mockResolvedValueOnce('background.png')
      .mockResolvedValueOnce('lia.png')
      .mockResolvedValueOnce('toto.png');
    service.submitWorkflow = vi.fn().mockResolvedValue('prompt-2');
    service.waitForHistory = vi.fn().mockResolvedValue({ outputs: { '9': { images: [{ filename: 'result.png' }] } } });
    service.downloadAsset = vi.fn().mockResolvedValue(Buffer.from('png'));

    await service.generateStillImage({
      positivePrompt: 'Lia and Toto in the station', negativePrompt: 'duplicate characters', checkpointName: 'sdxl.safetensors',
      width: 1000, height: 800, steps: 30, cfg: 6.5, sampler: 'dpmpp_2m', scheduler: 'karras', seed: 43,
      filenamePrefix: 'shot', referenceImagePath: 'C:/background.png', denoise: 0.62,
      regionalReferenceImages: [
        { path: 'C:/lia.png', xPercent: 10, yPercent: 20, widthPercent: 30, heightPercent: 60 },
        { path: 'C:/toto.png', xPercent: 60, yPercent: 25, widthPercent: 25, heightPercent: 55 }
      ]
    });

    const workflow = service.submitWorkflow.mock.calls[0][0];
    expect(workflow['20']).toMatchObject({ class_type: 'IPAdapterModelLoader' });
    expect(workflow['21']).toMatchObject({ class_type: 'CLIPVisionLoader' });
    expect(workflow['33']).toMatchObject({ class_type: 'MaskComposite', inputs: { x: 100, y: 160 } });
    expect(workflow['34']).toMatchObject({ class_type: 'IPAdapterAdvanced', inputs: { model: ['4', 0], attn_mask: ['33', 0] } });
    expect(workflow['39']).toMatchObject({ class_type: 'IPAdapterAdvanced', inputs: { model: ['34', 0], attn_mask: ['38', 0] } });
    expect(workflow['3'].inputs.model).toEqual(['39', 0]);
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
