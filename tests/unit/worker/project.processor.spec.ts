import { describe, expect, it, vi } from 'vitest';

import { ProjectProcessor } from '../../../apps/worker/src/processors/project.processor';

describe('ProjectProcessor', () => {
  it('moves the project and processing job to completed when the pipeline succeeds', async () => {
    const processingJob = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'processing-job-1'
      }),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined)
    };
    const project = {
      update: vi.fn().mockResolvedValue(undefined)
    };
    const prismaService = {
      processingJob,
      project
    } as never;
    const pipelineService = {
      run: vi.fn().mockResolvedValue(undefined)
    } as never;

    const processor = new ProjectProcessor(prismaService, pipelineService);

    await processor.process({
      id: 'bull-job-1',
      data: {
        projectId: 'project-1',
        organizationId: 'org-1',
        requestedByUserId: 'user-1'
      }
    });

    expect(project.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'project-1'
      },
      data: {
        status: 'processing',
        errorMessage: null
      }
    });
    expect(project.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'project-1'
      },
      data: {
        status: 'completed',
        errorMessage: null
      }
    });
    expect(processingJob.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'processing-job-1'
      },
      data: {
        status: 'active',
        progress: 10,
        errorMessage: null
      }
    });
    expect(processingJob.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'processing-job-1'
      },
      data: {
        status: 'completed',
        progress: 100,
        errorMessage: null
      }
    });
  });

  it('marks the project and processing job as failed when the pipeline throws', async () => {
    const processingJob = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'processing-job-1'
      }),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined)
    };
    const project = {
      update: vi.fn().mockResolvedValue(undefined)
    };
    const prismaService = {
      processingJob,
      project
    } as never;
    const pipelineService = {
      run: vi.fn().mockRejectedValue(new Error('pipeline failed'))
    } as never;

    const processor = new ProjectProcessor(prismaService, pipelineService);

    await expect(
      processor.process({
        id: 'bull-job-2',
        data: {
          projectId: 'project-2',
          organizationId: 'org-1',
          requestedByUserId: 'user-1'
        }
      })
    ).rejects.toThrow('pipeline failed');

    expect(project.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'project-2'
      },
      data: {
        status: 'processing',
        errorMessage: null
      }
    });
    expect(project.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'project-2'
      },
      data: {
        status: 'failed',
        errorMessage: 'pipeline failed'
      }
    });
    expect(processingJob.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'processing-job-1'
      },
      data: {
        status: 'failed',
        progress: 100,
        errorMessage: 'pipeline failed'
      }
    });
  });
});
