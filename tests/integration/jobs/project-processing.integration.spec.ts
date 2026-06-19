import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../../generated/prisma';
import request from 'supertest';

import { AppModule } from '../../../apps/api/src/app.module';
import { PrismaService as ApiPrismaService } from '../../../apps/api/src/database/prisma.service';
import { ProjectProcessingQueueService } from '../../../apps/api/src/modules/jobs/services/project-processing-queue.service';
import { PrismaService as WorkerPrismaService } from '../../../apps/worker/src/database/prisma.service';
import { ProjectProcessor } from '../../../apps/worker/src/processors/project.processor';
import { ProjectProcessingPipelineService } from '../../../apps/worker/src/services/project-processing-pipeline.service';

function buildSqliteUrl(relativePath: string): string {
  return `file:${relativePath.replace(/\\/g, '/')}`;
}

async function createTestDatabase(): Promise<{ client: PrismaClient; filePath: string }> {
  const relativeFilePath = `./tests/tmp/jobs-${randomUUID()}.db`;
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

describe('Project processing integration', () => {
  let prisma: PrismaClient;
  let databaseFilePath: string;
  let app: INestApplication;
  let authToken: string;
  let projectId: string;
  let sampleMp3Path: string;

  beforeEach(async () => {
    const database = await createTestDatabase();
    prisma = database.client;
    databaseFilePath = database.filePath;

    const queueService = {
      enqueue: async () => ({
        bullJobId: 'bull-job-1'
      })
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(ApiPrismaService)
      .useValue(prisma)
      .overrideProvider(ProjectProcessingQueueService)
      .useValue(queueService)
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
      name: 'Queue Owner',
      email: 'queue-owner@example.com',
      password: '12345678'
    });

    authToken = registerResponse.body.accessToken;

    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Queued Project'
      })
      .expect(201);

    projectId = createResponse.body.id;

    sampleMp3Path = resolve('tests', 'tmp', `queue-sample-${randomUUID()}.mp3`);
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
  });

  it('creates a queued processing job right after the MP3 upload', async () => {
    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', sampleMp3Path, {
        filename: 'track.mp3',
        contentType: 'audio/mpeg'
      })
      .expect(201);

    expect(uploadResponse.body.status).toBe('queued');

    const project = await prisma.project.findUnique({
      where: {
        id: projectId
      }
    });
    const processingJob = await prisma.processingJob.findFirst({
      where: {
        projectId
      }
    });

    expect(project?.status).toBe('queued');
    expect(processingJob?.queueName).toBe('project-processing');
    expect(processingJob?.jobName).toBe('project.process');
    expect(processingJob?.bullJobId).toBe('bull-job-1');
    expect(processingJob?.status).toBe('queued');
    expect(processingJob?.progress).toBe(0);
  });

  it('marks the project as completed when the worker pipeline succeeds', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', sampleMp3Path, {
        filename: 'track.mp3',
        contentType: 'audio/mpeg'
      })
      .expect(201);

    const processor = new ProjectProcessor(
      prisma as unknown as WorkerPrismaService,
      {
        run: async () => undefined
      } as ProjectProcessingPipelineService
    );

    await processor.process({
      id: 'bull-job-1',
      data: {
        projectId,
        organizationId: 'unused-org',
        requestedByUserId: 'unused-user'
      }
    });

    const project = await prisma.project.findUnique({
      where: {
        id: projectId
      }
    });
    const processingJob = await prisma.processingJob.findFirst({
      where: {
        projectId
      }
    });

    expect(project?.status).toBe('completed');
    expect(project?.errorMessage).toBeNull();
    expect(processingJob?.status).toBe('completed');
    expect(processingJob?.progress).toBe(100);
    expect(processingJob?.errorMessage).toBeNull();
  });

  it('marks the project as failed when the worker pipeline throws', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', sampleMp3Path, {
        filename: 'track.mp3',
        contentType: 'audio/mpeg'
      })
      .expect(201);

    const processor = new ProjectProcessor(
      prisma as unknown as WorkerPrismaService,
      {
        run: async () => {
          throw new Error('worker pipeline failed');
        }
      } as ProjectProcessingPipelineService
    );

    await expect(
      processor.process({
        id: 'bull-job-1',
        data: {
          projectId,
          organizationId: 'unused-org',
          requestedByUserId: 'unused-user'
        }
      })
    ).rejects.toThrow('worker pipeline failed');

    const project = await prisma.project.findUnique({
      where: {
        id: projectId
      }
    });
    const processingJob = await prisma.processingJob.findFirst({
      where: {
        projectId
      }
    });

    expect(project?.status).toBe('failed');
    expect(project?.errorMessage).toBe('worker pipeline failed');
    expect(processingJob?.status).toBe('failed');
    expect(processingJob?.progress).toBe(100);
    expect(processingJob?.errorMessage).toBe('worker pipeline failed');
  });
});
