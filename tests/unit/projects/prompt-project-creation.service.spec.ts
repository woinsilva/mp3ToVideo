import { describe, expect, it, vi } from 'vitest';

import { ProjectPresenter } from '../../../apps/api/src/modules/projects/services/project.presenter';
import { ProjectsService } from '../../../apps/api/src/modules/projects/services/projects.service';

describe('ProjectsService prompt-based creation', () => {
  it('persists the prompt and queues generation immediately without an audio track', async () => {
    const createdProject = {
      id: 'project-prompt-1',
      organizationId: 'org-1',
      createdByUserId: 'user-1',
      title: 'Floresta luminosa',
      generationMode: 'prompt',
      generationPrompt: 'Uma astronauta atravessa uma floresta bioluminescente.',
      stabilityTest: true,
      wanOnly: true,
      generationSeed: 424242,
      generationCfg: 3.5,
      generationSteps: 28,
      clipDurationSeconds: 5,
      sceneDurationSeconds: 5,
      visualCheckpointName: null,
      status: 'draft',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      lyrics: null
    };
    const queuedProject = { ...createdProject, status: 'queued' };
    const prismaService = {
      project: {
        create: vi.fn().mockResolvedValue(createdProject),
        update: vi.fn().mockResolvedValue(queuedProject),
        findFirst: vi.fn().mockResolvedValue(queuedProject)
      },
      processingJob: {
        create: vi.fn().mockResolvedValue({ id: 'processing-1' }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      $transaction: vi.fn().mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations))
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue({ bullJobId: 'bull-1' })
    };
    const service = new ProjectsService(
      prismaService as never,
      queueService as never,
      { build: vi.fn().mockReturnValue({ projectId: 'project-prompt-1' }) } as never,
      {} as never,
      new ProjectPresenter(),
      { get: vi.fn() } as never
    );

    const result = await service.createProject({
      organizationId: 'org-1',
      createdByUserId: 'user-1',
      title: 'Floresta luminosa',
      generationMode: 'prompt',
      generationPrompt: '  Uma astronauta atravessa uma floresta bioluminescente.  ',
      stabilityTest: true,
      wanOnly: true,
      generationSeed: 424242,
      generationCfg: 3.5,
      generationSteps: 28,
      clipDurationSeconds: 5,
      sceneDurationSeconds: 5
    });

    expect(prismaService.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationMode: 'prompt',
          generationPrompt: 'Uma astronauta atravessa uma floresta bioluminescente.',
          stabilityTest: true,
          wanOnly: true,
          generationSeed: 424242,
          generationCfg: 3.5,
          generationSteps: 28,
          clipDurationSeconds: 5
        })
      })
    );
    expect(queueService.enqueue).toHaveBeenCalledOnce();
    expect(result.status).toBe('queued');
    expect(result.generationMode).toBe('prompt');
    expect(result.generationPrompt).toBe(createdProject.generationPrompt);
  });

  it('requires a duration when generation uses a prompt', async () => {
    const service = new ProjectsService(
      { project: { create: vi.fn() } } as never,
      {} as never,
      {} as never,
      {} as never,
      new ProjectPresenter(),
      { get: vi.fn() } as never
    );

    await expect(
      service.createProject({
        organizationId: 'org-1',
        createdByUserId: 'user-1',
        title: 'Sem duração',
        generationMode: 'prompt',
        generationPrompt: 'Uma cena cinematográfica detalhada.'
      })
    ).rejects.toThrow('Video duration is required for direct video generation');
  });
});
