import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ChildrenClipAssetsService } from '../../../apps/api/src/modules/projects/services/children-clip-assets.service';

const project = {
  id: 'project-1',
  childrenClipPlan: { status: 'approved' },
  childrenClipShots: [{ id: 'shot-1' }]
};

function setup(queueState: string | null = null) {
  const tx = {
    childrenClipLocation: { updateMany: vi.fn() },
    childrenClipShotAsset: { updateMany: vi.fn() },
    childrenClipShotRenderAttempt: { updateMany: vi.fn() },
    childrenClipHeroShotAttempt: { updateMany: vi.fn() },
    childrenClipFinalRender: { updateMany: vi.fn() },
    processingJob: { updateMany: vi.fn() },
    childrenClip: { update: vi.fn() }
  };
  const prisma = {
    processingJob: { findMany: vi.fn().mockResolvedValue([{ bullJobId: 'bull-1' }]) },
    $transaction: vi.fn((operation: (client: typeof tx) => Promise<void>) => operation(tx))
  };
  const queue = { inspect: vi.fn().mockResolvedValue(queueState ? { state: queueState } : null) };
  const styles = { lock: vi.fn().mockResolvedValue({ versionNumber: 5 }) };
  const service = new ChildrenClipAssetsService(prisma as never, queue as never, {} as never, styles as never);
  vi.spyOn(service as never, 'getOwnedProject').mockResolvedValue(project as never);
  vi.spyOn(service as never, 'buildLocationWorkflow').mockReturnValue([{ id: 'location-1' }] as never);
  const enqueue = vi.spyOn(service as never, 'enqueueCompleteStep4').mockResolvedValue(undefined as never);
  vi.spyOn(service, 'get').mockResolvedValue({ summary: { totalShots: 1, approvedBackgrounds: 0, approvedStoryboards: 0 } } as never);
  return { service, styles, tx, enqueue };
}

describe('ChildrenClipAssetsService reset', () => {
  it('archives prior outputs, refreshes the style lock and queues the complete step 4', async () => {
    const { service, styles, tx, enqueue } = setup();

    await service.resetAndRegenerate('project-1', 'org-1', 'user-1');

    expect(styles.lock).toHaveBeenCalledWith('project-1', true);
    expect(tx.childrenClipLocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { masterBackgroundAssetId: null } }));
    expect(tx.childrenClipShotAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'rejected' }) }));
    expect(tx.childrenClipShotRenderAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed', stage: 'INVALIDATED' }) }));
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('refuses to reset while a dependent BullMQ job is live', async () => {
    const { service, styles } = setup('active');

    await expect(service.resetAndRegenerate('project-1', 'org-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(styles.lock).not.toHaveBeenCalled();
  });

  it('queues a background followed by a complete storyboard for every shot', async () => {
    const service = new ChildrenClipAssetsService({} as never, {} as never, {} as never, {} as never);
    const fullProject = {
      childrenClipShots: [
        { id: 'shot-1', index: 0, backgroundPrompt: 'station wide', description: 'Lia waves' },
        { id: 'shot-2', index: 1, backgroundPrompt: 'station close', description: 'Toto smiles' }
      ]
    };
    vi.spyOn(service as never, 'buildLocationWorkflow').mockReturnValue([{
      id: 'location-1', name: 'Station', anchorShotId: 'shot-1',
      shots: [{ id: 'shot-1' }, { id: 'shot-2' }]
    }] as never);
    const create = vi.spyOn(service as never, 'createAndEnqueue').mockResolvedValue(undefined as never);

    await (service as unknown as {
      enqueueCompleteStep4(project: unknown, projectId: string, organizationId: string, userId: string): Promise<void>;
    }).enqueueCompleteStep4(fullProject, 'project-1', 'org-1', 'user-1');

    expect(create.mock.calls.map((call) => (call[4] as { role: string }).role))
      .toEqual(['background', 'storyboard_frame', 'background', 'storyboard_frame']);
  });
});

describe('ChildrenClipAssetsService job reconciliation', () => {
  it('propagates an unhandled BullMQ failure to the job and asset shown by the UI', async () => {
    const processingUpdate = vi.fn().mockResolvedValue({});
    const assetUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      processingJob: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'processing-1', bullJobId: 'bull-1', progress: 25, activityLog: []
        }]),
        update: processingUpdate
      },
      childrenClipShotAsset: { updateMany: assetUpdate },
      $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations))
    };
    const queue = {
      inspect: vi.fn().mockResolvedValue({ state: 'failed', progress: 25, failedReason: 'ComfyUI indisponivel' })
    };
    const service = new ChildrenClipAssetsService(prisma as never, queue as never, {} as never, {} as never);

    await (service as unknown as { reconcileFailedAssetJobs(projectId: string): Promise<boolean> })
      .reconcileFailedAssetJobs('project-1');

    expect(processingUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', errorMessage: 'ComfyUI indisponivel' })
    }));
    expect(assetUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { bullJobId: 'bull-1' },
      data: expect.objectContaining({ status: 'failed', errorMessage: 'ComfyUI indisponivel' })
    }));
  });
});
