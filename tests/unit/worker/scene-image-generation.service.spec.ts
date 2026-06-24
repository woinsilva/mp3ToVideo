import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RenderStorageService } from '../../../apps/worker/src/services/render-storage.service';
import { SceneImageGenerationService } from '../../../apps/worker/src/services/scene-image-generation.service';

describe('SceneImageGenerationService', () => {
  const outputRoot = resolve('tests', 'tmp', 'scene-images');

  afterEach(() => {
    if (existsSync(outputRoot)) {
      rmSync(outputRoot, { force: true, recursive: true });
    }
  });

  it('returns null when the visual provider does not produce an image', async () => {
    const service = new SceneImageGenerationService(
      {
        generateImage: vi.fn().mockResolvedValue(null)
      } as never,
      new RenderStorageService({
        get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) =>
          key === 'storage.root' ? outputRoot : defaultValue
        )
      } as never)
    );

    await expect(
      service.generate({
        organizationId: 'org-1',
        projectId: 'project-1',
        sceneIndex: 0,
        sceneTitle: 'Intro',
        positivePrompt: 'city lights at night',
        negativePrompt: 'blurry, low quality',
        style: 'cinematic',
        camera: 'slow dolly in'
      })
    ).resolves.toBeNull();
  });

  it('persists the generated scene image and returns its asset metadata', async () => {
    mkdirSync(outputRoot, { recursive: true });

    const service = new SceneImageGenerationService(
      {
        generateImage: vi.fn().mockResolvedValue({ buffer: Buffer.from('png-bytes'), provider: 'comfyui-image' })
      } as never,
      new RenderStorageService({
        get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) =>
          key === 'storage.root' ? outputRoot : defaultValue
        )
      } as never)
    );

    const result = await service.generate({
      organizationId: 'org-1',
      projectId: 'project-1',
      sceneIndex: 1,
      sceneTitle: 'Refrain',
      positivePrompt: 'singer on stage',
      negativePrompt: 'deformed, noisy',
      style: 'concert film',
      camera: 'wide shot'
    });

    expect(result).toEqual({
      storagePath: `${outputRoot.replace(/\\/g, '/')}/generated-images/org-1/project-1/scene-002.png`,
      sizeBytes: 9,
      provider: 'comfyui-image'
    });
    expect(
      existsSync(resolve(outputRoot, 'generated-images', 'org-1', 'project-1', 'scene-002.png'))
    ).toBe(true);
  });
});
