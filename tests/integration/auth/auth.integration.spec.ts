import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../apps/api/src/app.module';
import { PrismaService } from '../../../apps/api/src/database/prisma.service';
import { PrismaClient } from '../../generated/prisma';

function buildSqliteUrl(relativePath: string): string {
  return `file:${relativePath.replace(/\\/g, '/')}`;
}

async function createTestDatabase(): Promise<{ client: PrismaClient; filePath: string }> {
  const relativeFilePath = `./tests/tmp/auth-${randomUUID()}.db`;
  const filePath = resolve(relativeFilePath);
  mkdirSync(dirname(filePath), { recursive: true });

  const env = {
    ...process.env,
    DATABASE_URL: buildSqliteUrl(relativeFilePath),
    RUST_LOG: 'info'
  };

  execFileSync(
    process.execPath,
    [
      resolve('node_modules', 'prisma', 'build', 'index.js'),
      'db',
      'push',
      '--schema',
      'prisma/schema.test.prisma',
      '--skip-generate'
    ],
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

describe('Auth integration', () => {
  let prisma: PrismaClient;
  let databaseFilePath: string;
  let app: INestApplication;

  beforeEach(async () => {
    const database = await createTestDatabase();
    prisma = database.client;
    databaseFilePath = database.filePath;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false
      })
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }

    if (databaseFilePath && existsSync(databaseFilePath)) {
      rmSync(databaseFilePath, { force: true });
    }
  });

  it('registers a user and creates a personal workspace', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Demo User',
        email: 'demo@example.com',
        password: '12345678'
      })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.email).toBe('demo@example.com');
    expect(response.body.organization.name).toBe('Demo User Workspace');

    const membership = await prisma.organizationMember.findFirst({
      where: {
        user: {
          email: 'demo@example.com'
        }
      },
      include: {
        organization: true,
        user: true
      }
    });

    expect(membership?.role).toBe('owner');
    expect(membership?.organization.slug).toBe('demo-user-workspace');
    expect(membership?.user.passwordHash).not.toBe('12345678');
  });

  it('logs in and returns the authenticated profile', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Demo User',
      email: 'demo@example.com',
      password: '12345678'
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'demo@example.com',
        password: '12345678'
      })
      .expect(201);

    expect(loginResponse.body.accessToken).toEqual(expect.any(String));

    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(meResponse.body.user.email).toBe('demo@example.com');
    expect(meResponse.body.organization.name).toBe('Demo User Workspace');
  });

  it('rejects invalid credentials', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Demo User',
      email: 'demo@example.com',
      password: '12345678'
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'demo@example.com',
        password: 'wrong-pass'
      })
      .expect(401);
  });
});
