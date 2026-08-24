import { describe, expect, it, vi } from 'vitest';

import { ChildrenClipStyleProfileService } from '../../../apps/api/src/modules/projects/services/children-clip-style-profile.service';

const project = (current: Record<string, unknown> | null = null, assetId = 'approved-asset') => ({
  id: 'project-1',
  childrenClip: { visualStyle: 'fallback model style' },
  childrenClipPlan: { visualBible: { style: 'Bible flat 2D. Não usar CGI, aquarela ou texturas realistas.', lineStyle: 'rounded outlines', palette: ['#111111'] } },
  childrenClipStyleProfile: current,
  characterLinks: [{
    sortOrder: 0,
    character: { name: 'Lia' },
    selectedVersion: {
      id: 'lia-v1', status: 'approved', description: 'Approved Lia design',
      assets: [{
        role: 'primary_reference', status: 'approved', generationPrompt: 'approved clean flat asset direction',
        asset: { id: assetId, updatedAt: new Date('2026-08-24T12:00:00Z'), sizeBytes: 100, width: 1536, height: 1024, storagePath: 'approved.png', metadata: null }
      }]
    }
  }]
});

const setup = (loaded: ReturnType<typeof project>) => {
  const upsert = vi.fn(async ({ create, update }: { create: unknown; update: unknown }) => ({ ...(loaded.childrenClipStyleProfile ? update : create), status: 'locked' }));
  const update = vi.fn(async ({ data }: { data: unknown }) => data);
  const prisma = {
    project: { findUnique: vi.fn(async () => loaded) },
    childrenClipStyleProfile: { findUnique: vi.fn(), upsert, update, updateMany: vi.fn() },
    childrenClipShot: { findMany: vi.fn(async () => []), update: vi.fn() }
  };
  const service = new ChildrenClipStyleProfileService(prisma as never, { getAbsolutePath: (path: string) => path } as never);
  vi.spyOn(service as never, 'analyzeImage').mockResolvedValue({ dominantColors: ['#FFCC00', '#55AAEE'], averageSaturation: 0.72, contrast: 0.31, edgeDensity: 0.07 });
  return { service, upsert, update };
};

describe('ChildrenClipStyleProfileService', () => {
  it('creates a locked profile from approved assets with asset evidence ahead of defaults', async () => {
    const { service, upsert } = setup(project());
    await service.lock('project-1');
    const payload = upsert.mock.calls[0][0].create;
    expect(payload.styleReferenceAssetIds).toEqual(['approved-asset']);
    expect(payload.sourceCharacterVersionIds).toEqual(['lia-v1']);
    expect(payload.profile.precedence).toEqual(['approved_character_assets', 'visual_bible', 'shot_text', 'model_defaults']);
    expect(payload.profile.palette).toEqual(expect.arrayContaining(['#FFCC00', '#55AAEE']));
    expect(payload.profile.maxBackgroundDetail).toBe('simple');
    expect(payload.negativeConstraints).toContain('CGI, aquarela ou texturas realistas');
  });

  it('does not mutate the canonical profile when the approved fingerprint is unchanged', async () => {
    const initial = setup(project());
    await initial.service.lock('project-1');
    const fingerprint = initial.upsert.mock.calls[0][0].create.sourceFingerprint;
    const current = { id: 'lock-1', status: 'locked', sourceFingerprint: fingerprint, versionNumber: 1 };
    const { service, upsert, update } = setup(project(current));
    expect(await service.lock('project-1')).toBe(current);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('marks the lock stale instead of silently replacing it when approved sources change', async () => {
    const current = { id: 'lock-1', status: 'locked', sourceFingerprint: 'old', versionNumber: 1 };
    const { service, upsert, update } = setup(project(current, 'new-approved-asset'));
    await service.lock('project-1');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'stale' }) }));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('only replaces a stale lock through an explicit forced refresh', async () => {
    const current = { id: 'lock-1', status: 'stale', sourceFingerprint: 'old', versionNumber: 1 };
    const { service, upsert } = setup(project(current));
    await service.lock('project-1', true);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ versionNumber: { increment: 1 }, status: 'locked' }) }));
  });
});
