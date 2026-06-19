import { buildDemoIdentity, slugifyWorkspaceName } from '../../../prisma/seed-data';

describe('prisma seed helpers', () => {
  it('slugifies workspace names consistently', () => {
    expect(slugifyWorkspaceName(' Demo Workspace 2026 ')).toBe('demo-workspace-2026');
  });

  it('builds a stable demo identity payload', () => {
    const demo = buildDemoIdentity();

    expect(demo.user.email).toBe('demo@example.com');
    expect(demo.organization.slug).toBe('demo-workspace');
    expect(demo.membershipRole).toBe('owner');
  });
});
