import { ProcessingJobStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { FrameInterpolationProcessor } from '../../../apps/worker/src/processors/frame-interpolation.processor';

const storedJob = {
  id: 'processing-job-1',
  status: ProcessingJobStatus.queued,
  progress: 0,
  activityLog: [],
  errorMessage: null
};

describe('FrameInterpolationProcessor', () => {
  it('uses the BullMQ job id as the ProcessingJob primary key and publishes progress to both stores', async () => {
    const prisma = {
      processingJob: {
        findUnique: vi.fn().mockResolvedValue(storedJob),
        update: vi.fn().mockResolvedValue(storedJob)
      }
    };
    const interpolation = {
      interpolate: vi.fn().mockImplementation(async ({ onProgress }) => {
        await onProgress('EXTRACTING_FRAMES', 15, 'Extraindo frames');
        return { id: 'asset-1' };
      })
    };
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    const gpu = { withLease: vi.fn((_label, operation) => operation()) };
    const processor = new FrameInterpolationProcessor(prisma as never, interpolation as never, gpu as never);

    await processor.process({
      id: 'processing-job-1',
      data: { projectId: 'project-1', organizationId: 'org-1', sourceAssetId: 'asset-source' },
      progress: 0,
      updateProgress
    } as never);

    expect(prisma.processingJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'processing-job-1' }
    });
    expect(prisma.processingJob.findUnique).not.toHaveBeenCalledWith({
      where: { bullJobId: 'processing-job-1' }
    });
    expect(updateProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'EXTRACTING_FRAMES',
      percent: 15
    }));
  });

  it('persists a visible failure when interpolation throws', async () => {
    const prisma = {
      processingJob: {
        findUnique: vi.fn().mockResolvedValue(storedJob),
        update: vi.fn().mockResolvedValue(storedJob)
      }
    };
    const interpolation = {
      interpolate: vi.fn().mockRejectedValue(new Error('RIFE model failed to load'))
    };
    const gpu = { withLease: vi.fn((_label, operation) => operation()) };
    const processor = new FrameInterpolationProcessor(prisma as never, interpolation as never, gpu as never);

    await expect(processor.process({
      id: 'processing-job-1',
      data: { projectId: 'project-1', organizationId: 'org-1', sourceAssetId: 'asset-source' },
      progress: 0,
      updateProgress: vi.fn().mockResolvedValue(undefined)
    } as never)).rejects.toThrow('RIFE model failed to load');

    expect(prisma.processingJob.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'processing-job-1' },
      data: expect.objectContaining({
        status: ProcessingJobStatus.failed,
        errorMessage: 'RIFE model failed to load'
      })
    }));
  });
});
