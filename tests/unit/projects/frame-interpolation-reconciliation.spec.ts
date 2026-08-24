import { ProcessingJobStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ProjectPresenter } from '../../../apps/api/src/modules/projects/services/project.presenter';
import { ProjectsService } from '../../../apps/api/src/modules/projects/services/projects.service';

describe('ProjectsService frame interpolation reconciliation', () => {
  it('turns a stale queued database record into a visible failure from BullMQ', async () => {
    const processingJob = {
      id: 'processing-job-1',
      projectId: 'project-1',
      queueName: 'frame-interpolation',
      jobName: 'render.interpolate',
      bullJobId: 'processing-job-1',
      status: ProcessingJobStatus.queued,
      progress: 0,
      detailMessage: 'Queued',
      activityLog: [],
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const update = vi.fn().mockImplementation(({ data }) => ({ ...processingJob, ...data }));
    const prisma = { processingJob: { update } };
    const bullQueue = {
      inspect: vi.fn().mockResolvedValue({
        state: 'failed',
        progress: 0,
        failedReason: 'RIFE executable could not start'
      })
    };
    const service = new ProjectsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      new ProjectPresenter(),
      {} as never,
      bullQueue as never
    );

    const reconciled = await (
      service as unknown as { reconcileFrameInterpolationJob(job: typeof processingJob): Promise<typeof processingJob> }
    ).reconcileFrameInterpolationJob(processingJob);

    expect(reconciled.status).toBe(ProcessingJobStatus.failed);
    expect(reconciled.errorMessage).toBe('RIFE executable could not start');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'processing-job-1' },
      data: expect.objectContaining({ status: ProcessingJobStatus.failed })
    }));
  });
});
