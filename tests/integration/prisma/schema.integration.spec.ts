import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PrismaClient, ProjectStatus } from '../../generated/prisma';
import { compareSync } from 'bcryptjs';

import {
  DEMO_LOGIN_PASSWORD,
  seedDatabase
} from '../../../prisma/seed-data';

function buildSqliteUrl(relativePath: string): string {
  return `file:${relativePath.replace(/\\/g, '/')}`;
}

function getPrismaExecutable(): string {
  return resolve('node_modules', 'prisma', 'build', 'index.js');
}

async function createTestDatabase(): Promise<{ client: PrismaClient; filePath: string }> {
  const relativeFilePath = `./tests/tmp/integration-${randomUUID()}.db`;
  const filePath = resolve(relativeFilePath);
  mkdirSync(dirname(filePath), { recursive: true });

  const env = {
    ...process.env,
    DATABASE_URL: buildSqliteUrl(relativeFilePath),
    RUST_LOG: 'info'
  };

  execFileSync(
    process.execPath,
    [getPrismaExecutable(), 'db', 'push', '--schema', 'prisma/schema.test.prisma', '--skip-generate'],
    {
      cwd: resolve('.'),
      env,
      stdio: 'pipe'
    }
  );

  const client = new PrismaClient({
    datasourceUrl: env.DATABASE_URL
  });

  await client.$connect();

  return {
    client,
    filePath
  };
}

describe('Prisma schema integration', () => {
  let prisma: PrismaClient;
  let databaseFilePath: string;

  beforeEach(async () => {
    const database = await createTestDatabase();
    prisma = database.client;
    databaseFilePath = database.filePath;
  });

  afterEach(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (databaseFilePath && existsSync(databaseFilePath)) {
      rmSync(databaseFilePath, { force: true });
    }
  });

  it('seeds a demo user, organization and membership', async () => {
    await seedDatabase(prisma);

    const user = await prisma.user.findUnique({
      where: {
        email: 'demo@example.com'
      },
      include: {
        organizationMembers: {
          include: {
            organization: true
          }
        }
      }
    });

    expect(user).not.toBeNull();
    expect(user?.organizationMembers).toHaveLength(1);
    expect(user?.organizationMembers[0]?.organization.slug).toBe('demo-workspace');
    expect(compareSync(DEMO_LOGIN_PASSWORD, user?.passwordHash ?? '')).toBe(true);
  });

  it('persists a project graph and loads related records', async () => {
    await seedDatabase(prisma);

    const user = await prisma.user.findUniqueOrThrow({
      where: {
        email: 'demo@example.com'
      }
    });

    const organization = await prisma.organization.findUniqueOrThrow({
      where: {
        slug: 'demo-workspace'
      }
    });

    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        createdByUserId: user.id,
        title: 'Integration Project',
        clipDurationSeconds: 20,
        status: ProjectStatus.uploaded,
        track: {
          create: {
            originalFileName: 'song.mp3',
            mimeType: 'audio/mpeg',
            sizeBytes: 4096,
            durationSeconds: 42.5,
            storagePath: 'storage/uploads/demo/original.mp3'
          }
        },
        lyrics: {
          create: {
            source: 'manual',
            rawText: 'line one',
            normalizedText: 'line one'
          }
        },
        musicSections: {
          create: [
            {
              type: 'intro',
              title: 'Intro',
              startSeconds: 0,
              endSeconds: 8
            }
          ]
        },
        storyboard: {
          create: {
            concept: 'Night drive',
            visualStyle: 'cinematic',
            mood: 'atmospheric',
            colorPalette: 'blue and amber',
            narrativeSummary: 'A solitary drive through the city'
          }
        },
        scenes: {
          create: [
            {
              index: 0,
              title: 'Scene 1',
              description: 'City lights reflect on the windshield',
              startSeconds: 0,
              endSeconds: 8,
              durationSeconds: 8,
              status: 'pending',
              prompt: {
                create: {
                  provider: 'mock',
                  positivePrompt: 'city lights, cinematic',
                  negativePrompt: 'blurry',
                  style: 'cinematic music video',
                  camera: 'slow dolly'
                }
              }
            }
          ]
        },
        assets: {
          create: [
            {
              organizationId: organization.id,
              type: 'audio',
              mimeType: 'audio/mpeg',
              storagePath: 'storage/uploads/demo/original.mp3',
              sizeBytes: 4096
            }
          ]
        },
        renders: {
          create: [
            {
              status: 'pending',
              durationSeconds: 42.5
            }
          ]
        },
        processingJobs: {
          create: [
            {
              queueName: 'project-processing',
              jobName: 'project.process',
              status: 'queued',
              progress: 0
            }
          ]
        }
      }
    });

    const hydratedProject = await prisma.project.findUnique({
      where: {
        id: project.id
      },
      include: {
        track: true,
        lyrics: true,
        musicSections: true,
        storyboard: true,
        scenes: {
          include: {
            prompt: true
          }
        },
        renders: true,
        processingJobs: true,
        assets: true
      }
    });

    expect(hydratedProject?.track?.originalFileName).toBe('song.mp3');
    expect(hydratedProject?.clipDurationSeconds).toBe(20);
    expect(hydratedProject?.lyrics?.source).toBe('manual');
    expect(hydratedProject?.musicSections).toHaveLength(1);
    expect(hydratedProject?.storyboard?.concept).toBe('Night drive');
    expect(hydratedProject?.scenes[0]?.prompt?.provider).toBe('mock');
    expect(hydratedProject?.renders).toHaveLength(1);
    expect(hydratedProject?.processingJobs).toHaveLength(1);
    expect(hydratedProject?.assets).toHaveLength(1);
  });
});
