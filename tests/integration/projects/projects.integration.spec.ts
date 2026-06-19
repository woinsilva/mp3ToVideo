import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../../generated/prisma';
import request from 'supertest';

import { AppModule } from '../../../apps/api/src/app.module';
import { PrismaService } from '../../../apps/api/src/database/prisma.service';

function buildSqliteUrl(relativePath: string): string {
  return `file:${relativePath.replace(/\\/g, '/')}`;
}

async function createTestDatabase(): Promise<{ client: PrismaClient; filePath: string }> {
  const relativeFilePath = `./tests/tmp/projects-${randomUUID()}.db`;
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

describe('Projects integration', () => {
  let prisma: PrismaClient;
  let databaseFilePath: string;
  let app: INestApplication;
  let authToken: string;
  let organizationId: string;
  let uploadedFilePath: string;
  let sampleMp3Path: string;

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

    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Project Owner',
      email: 'owner@example.com',
      password: '12345678'
    });

    authToken = registerResponse.body.accessToken;
    organizationId = registerResponse.body.organization.id;

    sampleMp3Path = resolve('tests', 'tmp', `sample-${randomUUID()}.mp3`);
    mkdirSync(dirname(sampleMp3Path), { recursive: true });
    writeFileSync(sampleMp3Path, Buffer.from('ID3 sample mp3 payload'));
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

    if (sampleMp3Path && existsSync(sampleMp3Path)) {
      rmSync(sampleMp3Path, { force: true });
    }

    if (uploadedFilePath && existsSync(uploadedFilePath)) {
      rmSync(uploadedFilePath, { force: true });
    }
  });

  it('creates, lists and fetches projects for the authenticated organization', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'My First Clip'
      })
      .expect(201);

    expect(createResponse.body.title).toBe('My First Clip');
    expect(createResponse.body.status).toBe('draft');

    const listResponse = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].title).toBe('My First Clip');

    const detailResponse = await request(app.getHttpServer())
      .get(`/projects/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(detailResponse.body.id).toBe(createResponse.body.id);
    expect(detailResponse.body.status).toBe('draft');
  });

  it('uploads an MP3 track, stores it on disk and updates project state', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Upload Flow'
      })
      .expect(201);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${createResponse.body.id}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', sampleMp3Path, {
        filename: 'track.mp3',
        contentType: 'audio/mpeg'
      })
      .expect(201);

    expect(uploadResponse.body.projectId).toBe(createResponse.body.id);
    expect(uploadResponse.body.status).toBe('uploaded');

    const track = await prisma.track.findUnique({
      where: {
        projectId: createResponse.body.id
      }
    });

    expect(track?.originalFileName).toBe('track.mp3');
    expect(track?.mimeType).toBe('audio/mpeg');

    const asset = await prisma.asset.findFirst({
      where: {
        projectId: createResponse.body.id,
        type: 'audio'
      }
    });

    expect(asset?.organizationId).toBe(organizationId);

    const project = await prisma.project.findUnique({
      where: {
        id: createResponse.body.id
      }
    });

    expect(project?.status).toBe('uploaded');

    uploadedFilePath = resolve(track?.storagePath ?? '');
    expect(existsSync(uploadedFilePath)).toBe(true);
    expect(readFileSync(uploadedFilePath).length).toBeGreaterThan(0);
  });

  it('rejects non-MP3 uploads', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Bad Upload'
      })
      .expect(201);

    const sampleTxtPath = resolve('tests', 'tmp', `sample-${randomUUID()}.txt`);
    writeFileSync(sampleTxtPath, 'not an mp3');

    try {
      await request(app.getHttpServer())
        .post(`/projects/${createResponse.body.id}/upload-track`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', sampleTxtPath, {
          filename: 'track.txt',
          contentType: 'text/plain'
        })
        .expect(400);
    } finally {
      if (existsSync(sampleTxtPath)) {
        rmSync(sampleTxtPath, { force: true });
      }
    }
  });
});
