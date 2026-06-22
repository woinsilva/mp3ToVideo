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
  let secondAuthToken: string;
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

    const secondRegisterResponse = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Other Owner',
      email: 'other-owner@example.com',
      password: '12345678'
    });

    secondAuthToken = secondRegisterResponse.body.accessToken;

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
    expect(uploadResponse.body.status).toBe('queued');

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

    expect(project?.status).toBe('queued');

    const processingJob = await prisma.processingJob.findFirst({
      where: {
        projectId: createResponse.body.id
      }
    });

    expect(processingJob?.status).toBe('queued');

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

  it('returns project status, scenes, render metadata and downloads the final mp4', async () => {
    const project = await prisma.project.create({
      data: {
        organizationId,
        createdByUserId: (
          await prisma.user.findUniqueOrThrow({
            where: {
              email: 'owner@example.com'
            }
          })
        ).id,
        title: 'Ready Project',
        status: 'completed'
      }
    });

    await prisma.processingJob.create({
      data: {
        projectId: project.id,
        queueName: 'project-processing',
        jobName: 'project.process',
        bullJobId: 'bull-job-1',
        status: 'completed',
        progress: 100
      }
    });

    await prisma.storyboard.create({
      data: {
        projectId: project.id,
        concept: 'Concept',
        visualStyle: 'cinematic music video',
        mood: 'emotional',
        colorPalette: 'deep blue',
        narrativeSummary: 'Narrative'
      }
    });

    const section = await prisma.musicSection.create({
      data: {
        projectId: project.id,
        type: 'verse',
        title: 'Verse 1',
        startSeconds: 0,
        endSeconds: 8,
        lyricsExcerpt: 'sample line',
        energy: 0.55
      }
    });

    const renderPath = resolve('storage', 'renders', organizationId, project.id, 'final.mp4');
    mkdirSync(dirname(renderPath), { recursive: true });
    writeFileSync(renderPath, Buffer.from('final-mp4-content'));

    const sceneAsset = await prisma.asset.create({
      data: {
        organizationId,
        projectId: project.id,
        type: 'video_scene',
        mimeType: 'video/mp4',
        storagePath: `storage/generated-scenes/${organizationId}/${project.id}/scene-001.mp4`,
        sizeBytes: 123
      }
    });

    const scene = await prisma.scene.create({
      data: {
        projectId: project.id,
        musicSectionId: section.id,
        index: 0,
        title: 'Verse 1 Scene 1',
        description: 'Scene description',
        startSeconds: 0,
        endSeconds: 8,
        durationSeconds: 8,
        status: 'completed',
        videoAssetId: sceneAsset.id
      }
    });

    await prisma.scenePrompt.create({
      data: {
        sceneId: scene.id,
        provider: 'mock',
        positivePrompt: 'positive prompt',
        negativePrompt: 'negative prompt',
        style: 'cinematic music video',
        camera: 'cinematic medium shot'
      }
    });

    const renderAsset = await prisma.asset.create({
      data: {
        organizationId,
        projectId: project.id,
        type: 'render',
        mimeType: 'video/mp4',
        storagePath: `storage/renders/${organizationId}/${project.id}/final.mp4`,
        sizeBytes: 18
      }
    });

    await prisma.render.create({
      data: {
        projectId: project.id,
        status: 'completed',
        assetId: renderAsset.id,
        durationSeconds: 8
      }
    });

    const statusResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(statusResponse.body).toEqual({
      projectId: project.id,
      status: 'completed',
      progress: 100,
      currentStep: 'Completed',
      errorMessage: null
    });

    const scenesResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/scenes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(scenesResponse.body).toHaveLength(1);
    expect(scenesResponse.body[0].prompt.provider).toBe('mock');
    expect(scenesResponse.body[0].videoAssetId).toBe(sceneAsset.id);

    const renderResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/render`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(renderResponse.body.status).toBe('completed');
    expect(renderResponse.body.asset.id).toBe(renderAsset.id);

    const downloadResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/download`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(downloadResponse.headers['content-type']).toContain('video/mp4');
    expect(downloadResponse.body).toEqual(Buffer.from('final-mp4-content'));

    await request(app.getHttpServer())
      .get(`/projects/${project.id}/status`)
      .set('Authorization', `Bearer ${secondAuthToken}`)
      .expect(404);
  });
});
