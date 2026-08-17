import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectRenderService } from '../../../apps/worker/src/services/project-render.service';

describe('ProjectRenderService', () => {
  afterEach(() => {
    const root = resolve('tests', 'tmp', 'project-render-service');

    rmSync(root, { force: true, recursive: true });
  });

  it('rejects an empty scene list before creating an invalid FFmpeg concat file', async () => {
    const renderFindFirst = vi.fn();
    const service = new ProjectRenderService(
      { render: { findFirst: renderFindFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(
      service.render({
        organizationId: 'org-1',
        projectId: 'project-1',
        audioPath: null,
        durationSeconds: 2,
        visualCheckpointName: null,
        stabilityTest: true,
        wanOnly: true,
        generationSeed: 123,
        generationCfg: 4.5,
        generationSteps: 24,
        scenes: []
      })
    ).rejects.toThrow('Nenhuma cena foi planejada para o projeto');

    expect(renderFindFirst).not.toHaveBeenCalled();
  });

  it('rejects I2V without the original image before any T2V or procedural fallback', async () => {
    const renderFindFirst = vi.fn();
    const generateVideo = vi.fn();
    const createSceneClip = vi.fn();
    const service = new ProjectRenderService(
      { render: { findFirst: renderFindFirst } } as never,
      {} as never,
      {} as never,
      { generate: generateVideo } as never,
      {} as never,
      { createSceneClip } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.render({
        organizationId: 'org-1',
        projectId: 'project-1',
        generationMode: 'image',
        audioPath: null,
        durationSeconds: 2,
        visualCheckpointName: null,
        stabilityTest: false,
        wanOnly: true,
        generationSeed: 123,
        generationCfg: 4.5,
        generationSteps: 24,
        scenes: [{
          id: 'scene-1',
          title: 'I2V scene',
          durationSeconds: 2,
          sectionType: 'intro',
          status: 'pending',
          visualProvider: null,
          videoAssetStoragePath: null,
          referenceImageStoragePath: null
        }]
      })
    ).rejects.toThrow('Nenhum fallback T2V foi executado');

    expect(renderFindFirst).not.toHaveBeenCalled();
    expect(generateVideo).not.toHaveBeenCalled();
    expect(createSceneClip).not.toHaveBeenCalled();
  });

  it('fails a Wan-only scene explicitly without image or procedural fallbacks', async () => {
    const prismaService = {
      render: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'render-1' }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      scenePrompt: {
        findUnique: vi.fn().mockResolvedValue({
          sceneId: 'scene-1',
          positivePrompt: 'sunset over the ocean',
          negativePrompt: 'blurry',
          style: 'cinematic',
          camera: 'wide shot'
        })
      },
      scene: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      asset: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      sceneRenderAttempt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'attempt-1',
          attemptNumber: 1,
          startedAt: new Date()
        }),
        findUnique: vi.fn().mockResolvedValue({
          startedAt: new Date(),
          status: 'waiting_external'
        }),
        update: vi.fn().mockResolvedValue(undefined)
      }
    } as never;

    const createSceneClip = vi.fn();
    const generateImage = vi.fn().mockRejectedValue(new Error('image fallback should not run'));

    const service = new ProjectRenderService(
      prismaService,
      {
        get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'visual.provider') {
            return 'comfyui';
          }

          if (key === 'ai.enableFallbacks') {
            return true;
          }

          return defaultValue;
        })
      } as never,
      {
        buildSceneClipPath: vi.fn().mockReturnValue('storage/generated-scenes/org-1/project-1/scene-001.mp4'),
        ensureParentDirectory: vi.fn().mockResolvedValue('C:/Dev/Video/storage/generated-scenes/org-1/project-1/scene-001.mp4')
      } as never,
      {
        generate: vi.fn().mockRejectedValue(new Error('ComfyUI video workflow rejected: missing video model'))
      } as never,
      {
        generate: generateImage
      } as never,
      {
        createSceneClip,
        createSceneClipFromImage: vi.fn(),
        extractLastFrame: vi.fn(),
        concatSceneClips: vi.fn(),
        muxAudio: vi.fn()
      } as never,
      {
        heartbeat: vi.fn().mockResolvedValue(undefined)
      } as never,
      {
        resolve: vi.fn().mockReturnValue({
          workflowName: 'wan-2.2-ti2v-5b',
          positivePrompt: 'sunset over the ocean',
          negativePrompt: 'blurry',
          seed: 123,
          cfg: 4.5,
          steps: 24,
          sampler: 'uni_pc',
          scheduler: 'simple',
          width: 1280,
          height: 704,
          fps: 16,
          frameCount: 129,
          requestedDurationSeconds: 8,
          effectiveDurationSeconds: 8,
          unetName: 'wan.safetensors',
          clipName: 'clip.safetensors',
          clipType: 'wan',
          vaeName: 'vae.safetensors',
          modelShift: 8
        })
      } as never
    );

    await expect(
      service.render({
        organizationId: 'org-1',
        projectId: 'project-1',
        audioPath: 'storage/uploads/org-1/project-1/original.mp3',
        durationSeconds: 8,
        visualCheckpointName: null,
        stabilityTest: false,
        wanOnly: true,
        generationSeed: null,
        generationCfg: null,
        generationSteps: null,
        scenes: [
          {
            id: 'scene-1',
            title: 'Intro Scene',
            durationSeconds: 8,
            sectionType: 'intro',
            status: 'pending',
            visualProvider: null,
            videoAssetStoragePath: null,
            referenceImageStoragePath: null
          }
        ]
      })
    ).rejects.toThrow(
      'ComfyUI video workflow rejected: missing video model'
    );

    expect(createSceneClip).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
    expect(prismaService.scene.update).toHaveBeenCalledWith({
      where: {
        id: 'scene-1'
      },
      data: {
        status: 'failed'
      }
    });
    expect(prismaService.render.update).toHaveBeenCalledWith({
      where: {
        id: 'render-1'
      },
      data: {
        status: 'failed',
        durationSeconds: 8
      }
    });
  });

  it('reuses a completed scene and finalizes a prompt-based video without muxing audio', async () => {
    const reusedScenePath = resolve(
      'tests',
      'tmp',
      'project-render-service',
      'generated-scenes',
      'org-1',
      'project-1',
      'scene-001.mp4'
    );
    const intermediatePath = resolve(
      'tests',
      'tmp',
      'project-render-service',
      'temp',
      'project-1',
      'video-track.mp4'
    );
    const finalPath = resolve(
      'tests',
      'tmp',
      'project-render-service',
      'renders',
      'org-1',
      'project-1',
      'final.mp4'
    );
    const continuityFramePath = resolve(
      'tests',
      'tmp',
      'project-render-service',
      'continuity-frames',
      'org-1',
      'project-1',
      'scene-001-last-frame.png'
    );

    mkdirSync(dirname(reusedScenePath), { recursive: true });
    writeFileSync(reusedScenePath, Buffer.from('existing-scene'));

    const prismaService = {
      render: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'render-1' }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      scenePrompt: {
        findUnique: vi.fn()
      },
      scene: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      asset: {
        create: vi.fn()
          .mockResolvedValueOnce({ id: 'render-asset-1' })
      },
      sceneRenderAttempt: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn()
      }
    } as never;

    const muxAudio = vi.fn();
    const service = new ProjectRenderService(
      prismaService,
      {
        get: vi.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue)
      } as never,
      {
        getAbsolutePath: vi.fn().mockImplementation((path: string) => path),
        buildContinuityFramePath: vi.fn().mockReturnValue(continuityFramePath),
        buildConcatListPath: vi.fn().mockReturnValue(resolve('tests', 'tmp', 'project-render-service', 'temp', 'project-1', 'concat-list.txt')),
        writeConcatList: vi.fn().mockResolvedValue(resolve('tests', 'tmp', 'project-render-service', 'temp', 'project-1', 'concat-list.txt')),
        buildIntermediateVideoPath: vi.fn().mockReturnValue(intermediatePath),
        ensureParentDirectory: vi.fn().mockImplementation(async (path: string) => {
          mkdirSync(dirname(path), { recursive: true });
          return path;
        }),
        buildFinalRenderPath: vi.fn().mockReturnValue(finalPath)
      } as never,
      {
        generate: vi.fn()
      } as never,
      {
        generate: vi.fn()
      } as never,
      {
        createSceneClip: vi.fn(),
        createSceneClipFromImage: vi.fn(),
        extractLastFrame: vi.fn().mockImplementation(async (_videoPath: string, outputPath: string) => {
          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, Buffer.from('last-frame'));
        }),
        concatSceneClips: vi.fn().mockImplementation(async (_listPath: string, outputPath: string) => {
          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, Buffer.from('intermediate'));
        }),
        muxAudio
      } as never,
      {
        heartbeat: vi.fn().mockResolvedValue(undefined)
      } as never,
      {
        resolve: vi.fn()
      } as never
    );

    await service.render({
      organizationId: 'org-1',
      projectId: 'project-1',
      audioPath: null,
      durationSeconds: 8,
      visualCheckpointName: null,
      stabilityTest: true,
      wanOnly: true,
      generationSeed: 123,
      generationCfg: 4.5,
      generationSteps: 24,
      scenes: [
        {
          id: 'scene-1',
          title: 'Intro Scene',
          durationSeconds: 8,
          sectionType: 'intro',
          status: 'completed',
          visualProvider: 'comfyui-video',
          videoAssetStoragePath: reusedScenePath,
          referenceImageStoragePath: null
        }
      ]
    });

    expect(prismaService.scenePrompt.findUnique).not.toHaveBeenCalled();
    expect(prismaService.scene.update).not.toHaveBeenCalled();
    expect(muxAudio).not.toHaveBeenCalled();
    expect(prismaService.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'render',
        storagePath: finalPath
      })
    });
  });
});
