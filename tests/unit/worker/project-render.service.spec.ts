import { describe, expect, it, vi } from 'vitest';

import { ProjectRenderService } from '../../../apps/worker/src/services/project-render.service';

describe('ProjectRenderService', () => {
  it('fails the scene explicitly when ComfyUI generation fails and should not fall back to a procedural clip', async () => {
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
      }
    } as never;

    const createSceneClip = vi.fn();

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
        generate: vi.fn().mockRejectedValue(new Error('ComfyUI image workflow rejected: missing checkpoint'))
      } as never,
      {
        createSceneClip,
        createSceneClipFromImage: vi.fn(),
        concatSceneClips: vi.fn(),
        muxAudio: vi.fn()
      } as never,
      {
        heartbeat: vi.fn().mockResolvedValue(undefined)
      } as never
    );

    await expect(
      service.render({
        organizationId: 'org-1',
        projectId: 'project-1',
        audioPath: 'storage/uploads/org-1/project-1/original.mp3',
        durationSeconds: 8,
        scenes: [
          {
            id: 'scene-1',
            title: 'Intro Scene',
            durationSeconds: 8,
            sectionType: 'intro'
          }
        ]
      })
    ).rejects.toThrow(
      'Cena 1 (Intro Scene) falhou na geracao visual: video: ComfyUI video workflow rejected: missing video model | imagem: ComfyUI image workflow rejected: missing checkpoint.'
    );

    expect(createSceneClip).not.toHaveBeenCalled();
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
});
