import { describe, expect, it, vi } from 'vitest';

import { ComfyUiClientService } from '../../../apps/worker/src/services/comfyui-client.service';

describe('ComfyUiClientService', () => {
  it('accepts SaveVideo outputs that store the mp4 asset under images', () => {
    const service = new ComfyUiClientService(
      {
        get: vi.fn()
      } as never,
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
