import type { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

export const DEMO_LOGIN_EMAIL = 'demo@example.com';
export const DEMO_LOGIN_PASSWORD = '12345678';

export interface DemoIdentity {
  user: {
    email: string;
    name: string;
    passwordHash: string;
  };
  organization: {
    name: string;
    slug: string;
  };
  membershipRole: 'owner';
}

export function slugifyWorkspaceName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildDemoIdentity(): DemoIdentity {
  return {
    user: {
      email: DEMO_LOGIN_EMAIL,
      name: 'Demo User',
      passwordHash: hashSync(DEMO_LOGIN_PASSWORD, 10)
    },
    organization: {
      name: 'Demo Workspace',
      slug: slugifyWorkspaceName('Demo Workspace')
    },
    membershipRole: 'owner'
  };
}

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  const demo = buildDemoIdentity();

  const organization = await prisma.organization.upsert({
    where: {
      slug: demo.organization.slug
    },
    update: {
      name: demo.organization.name
    },
    create: demo.organization
  });

  const user = await prisma.user.upsert({
    where: {
      email: demo.user.email
    },
    update: {
      name: demo.user.name,
      passwordHash: demo.user.passwordHash
    },
    create: demo.user
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id
      }
    },
    update: {
      role: demo.membershipRole
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: demo.membershipRole
    }
  });
}
