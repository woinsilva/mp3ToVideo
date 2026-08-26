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

  it('removes backgrounds from exact approved references and composites their isolated layers', async () => {
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
        { path: 'C:/lia.png', prompt: 'render only Lia', xPercent: 10, yPercent: 20, widthPercent: 30, heightPercent: 60, crop: { width: 400, height: 1000, x: 0, y: 0 } },
        { path: 'C:/toto.png', prompt: 'render only Toto', xPercent: 60, yPercent: 25, widthPercent: 25, heightPercent: 55 }
      ]
    });

    const workflow = service.submitWorkflow.mock.calls[0][0];
    expect(workflow['22']).toMatchObject({ class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: 'birefnet.safetensors' } });
    expect(workflow['31']).toMatchObject({ class_type: 'ImageCrop', inputs: { width: 400, height: 1000, x: 0, y: 0 } });
    expect(workflow['32']).toMatchObject({ class_type: 'RemoveBackground', inputs: { bg_removal_model: ['22', 0], image: ['31', 0] } });
    expect(workflow['37']).toMatchObject({ class_type: 'ImageCompositeMasked', inputs: { destination: ['12', 0], x: 100, y: 160, mask: ['36', 0] } });
    expect(workflow['40']).toMatchObject({ class_type: 'RemoveBackground', inputs: { bg_removal_model: ['22', 0], image: ['38', 0] } });
    expect(workflow['45']).toMatchObject({ class_type: 'ImageCompositeMasked', inputs: { destination: ['37', 0], x: 600, y: 200, mask: ['44', 0] } });
    expect(workflow['20']).toBeUndefined();
    expect(workflow['21']).toBeUndefined();
    expect(workflow['3']).toBeUndefined();
    expect(workflow['9'].inputs.images).toEqual(['45', 0]);
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
