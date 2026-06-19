import { SlugService } from '../../../apps/api/src/modules/auth/services/slug.service';

describe('SlugService', () => {
  it('slugifies workspace names consistently', () => {
    const service = new SlugService({
      organization: {
        findUnique: vi.fn()
      }
    } as never);

    expect(service.slugify(' Demo User Workspace ')).toBe('demo-user-workspace');
    expect(service.slugify('Studio & Beats')).toBe('studio-beats');
  });

  it('appends a numeric suffix when a slug already exists', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);

    const service = new SlugService({
      organization: {
        findUnique
      }
    } as never);

    await expect(service.generateUniqueOrganizationSlug('Demo User Workspace')).resolves.toBe(
      'demo-user-workspace-1'
    );
  });
});
