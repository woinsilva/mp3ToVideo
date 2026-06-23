import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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
import { AudioMetadataService } from '../../../apps/worker/src/services/audio-metadata.service';
import { AudioExcerptService } from '../../../apps/worker/src/services/audio-excerpt.service';
import { LyricsFallbackService } from '../../../apps/worker/src/services/lyrics-fallback.service';
import { LyricsGenerationService } from '../../../apps/worker/src/services/lyrics-generation.service';
import { MusicStructureService } from '../../../apps/worker/src/services/music-structure.service';
import { OllamaClientService } from '../../../apps/worker/src/services/ollama-client.service';
import { ProcessingProgressService } from '../../../apps/worker/src/services/processing-progress.service';
import { ProjectPipelineStateService } from '../../../apps/worker/src/services/project-pipeline-state.service';
import { ProjectProcessingPipelineService } from '../../../apps/worker/src/services/project-processing-pipeline.service';
import { ProjectRenderService } from '../../../apps/worker/src/services/project-render.service';
import { RenderStorageService } from '../../../apps/worker/src/services/render-storage.service';
import { ScenePlanningService } from '../../../apps/worker/src/services/scene-planning.service';
import { ScenePromptGenerationService } from '../../../apps/worker/src/services/scene-prompt-generation.service';
import { ScenePromptService } from '../../../apps/worker/src/services/scene-prompt.service';
import { StoryboardGenerationService } from '../../../apps/worker/src/services/storyboard-generation.service';
import { StoryboardFallbackService } from '../../../apps/worker/src/services/storyboard-fallback.service';
import { WhisperTranscriptionService } from '../../../apps/worker/src/services/whisper-transcription.service';

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
  let organizationId: string;
  let userId: string;

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
    organizationId = registerResponse.body.organization.id;
    userId = registerResponse.body.user.id;

    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Queued Project',
        clipDurationSeconds: 20
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

    if (projectId) {
      const projectTempDir = resolve('storage', 'temp', projectId);
      const projectSceneDir = resolve('storage', 'generated-scenes', organizationId, projectId);
      const projectRenderDir = resolve('storage', 'renders', organizationId, projectId);

      if (existsSync(projectTempDir)) {
        rmSync(projectTempDir, { force: true, recursive: true });
      }

      if (existsSync(projectSceneDir)) {
        rmSync(projectSceneDir, { force: true, recursive: true });
      }

      if (existsSync(projectRenderDir)) {
        rmSync(projectRenderDir, { force: true, recursive: true });
      }
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

    const configService = {
      get: (key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          'storage.root': './storage',
          'audio.ffprobePath': 'ffprobe',
          'audio.mockDurationSeconds': 30,
          'audio.enableWhisper': false,
          'audio.whisperPythonPath': 'python',
          'audio.whisperModel': 'distil-large-v3',
          'audio.whisperDevice': 'cuda',
          'audio.whisperComputeType': 'float16',
          'audio.whisperTimeoutMs': 600000,
          'audio.whisperLanguage': '',
          'ai.enableOllama': false,
          'ai.ollamaBaseUrl': 'http://localhost:11434',
          'ai.ollamaModel': 'qwen3:8b',
          'ai.ollamaTimeoutMs': 180000,
          'ai.enableFallbacks': true,
          'visual.provider': 'procedural',
          'visual.comfyuiBaseUrl': 'http://localhost:8188',
          'visual.comfyuiOutputHostPath': './storage/comfyui/output',
          'visual.comfyuiTimeoutMs': 300000,
          'visual.comfyuiPollIntervalMs': 3000,
          'visual.comfyuiCheckpointName': 'sd_xl_turbo_1.0.safetensors',
          'visual.comfyuiVideoUnetName': 'wan2.2_ti2v_5B_fp16.safetensors',
          'visual.comfyuiVideoClipName': 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
          'visual.comfyuiVideoClipType': 'wan',
          'visual.comfyuiVideoVaeName': 'wan2.2_vae.safetensors',
          'visual.comfyuiVideoModelShift': 8,
          'visual.comfyuiVideoFps': 24,
          'visual.comfyuiWidth': 1280,
          'visual.comfyuiHeight': 704,
          'visual.comfyuiSteps': 20,
          'visual.comfyuiCfg': 5,
          'visual.comfyuiSampler': 'uni_pc',
          'visual.comfyuiScheduler': 'simple',
          'rendering.ffmpegPath': 'ffmpeg',
          'rendering.width': 1280,
          'rendering.height': 720,
          'rendering.frameRate': 24
        };

        return key in values ? values[key] : defaultValue;
      }
    } as never;
    const processingProgressService = new ProcessingProgressService(
      prisma as unknown as WorkerPrismaService
    );
    const ollamaClientService = new OllamaClientService(configService);
    const storyboardGenerationService = new StoryboardGenerationService(
      ollamaClientService,
      new StoryboardFallbackService()
    );
    const scenePromptGenerationService = new ScenePromptGenerationService(
      ollamaClientService,
      new ScenePromptService()
    );
    const lyricsGenerationService = new LyricsGenerationService(
      new WhisperTranscriptionService(configService),
      new LyricsFallbackService()
    );
    const renderStorageService = new RenderStorageService(configService);
    const projectRenderService = new ProjectRenderService(
      prisma as unknown as WorkerPrismaService,
      renderStorageService,
      {
        generate: async () => null
      } as never,
      {
        generate: async () => null
      } as never,
      {
        createSceneClip: async (outputPath: string) => {
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from('fake-scene-video'));
        },
        createSceneClipFromImage: async (outputPath: string) => {
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from('fake-scene-video-from-image'));
        },
        concatSceneClips: async (_inputListPath: string, outputPath: string) => {
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from('fake-video-track'));
        },
        muxAudio: async (_videoPath: string, _audioPath: string, outputPath: string) => {
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from('fake-final-mp4'));
        }
      } as never,
      processingProgressService
    );

    const processor = new ProjectProcessor(
      prisma as unknown as WorkerPrismaService,
      processingProgressService,
      new ProjectProcessingPipelineService(
        prisma as unknown as WorkerPrismaService,
        new ProjectPipelineStateService(prisma as unknown as WorkerPrismaService),
        new AudioMetadataService(configService),
        {
          buildInitialExcerpt: async () => sampleMp3Path
        } as AudioExcerptService,
        lyricsGenerationService,
        new MusicStructureService(),
        storyboardGenerationService,
        new ScenePlanningService(),
        scenePromptGenerationService,
        projectRenderService
      )
    );

    await processor.process({
      id: 'bull-job-1',
      data: {
        projectId,
        organizationId,
        requestedByUserId: userId
      }
    });

    const project = await prisma.project.findUnique({
      where: {
        id: projectId
      }
    });
    const track = await prisma.track.findUnique({
      where: {
        projectId
      }
    });
    const lyrics = await prisma.lyrics.findUnique({
      where: {
        projectId
      }
    });
    const sections = await prisma.musicSection.findMany({
      where: {
        projectId
      },
      orderBy: {
        startSeconds: 'asc'
      }
    });
    const storyboard = await prisma.storyboard.findUnique({
      where: {
        projectId
      }
    });
    const scenes = await prisma.scene.findMany({
      where: {
        projectId
      },
      include: {
        prompt: true
      },
      orderBy: {
        index: 'asc'
      }
    });
    const render = await prisma.render.findFirst({
      where: {
        projectId
      }
    });
    const renderAsset = await prisma.asset.findFirst({
      where: {
        projectId,
        type: 'render'
      }
    });
    const sceneAssets = await prisma.asset.findMany({
      where: {
        projectId,
        type: 'video_scene'
      }
    });
    const processingJob = await prisma.processingJob.findFirst({
      where: {
        projectId
      }
    });

    expect(project?.status).toBe('completed');
    expect(project?.errorMessage).toBeNull();
    expect(track?.durationSeconds).toBe(30);
    expect(lyrics?.source).toBe('mock');
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0]?.startSeconds).toBe(0);
    expect(sections.at(-1)?.endSeconds).toBe(20);
    expect(storyboard?.visualStyle).toBe('cinematic music video');
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.every((scene) => scene.prompt)).toBe(true);
    expect(scenes.every((scene) => scene.status === 'completed')).toBe(true);
    expect(scenes.every((scene) => scene.videoAssetId)).toBe(true);
    expect(scenes[0]?.startSeconds).toBe(0);
    expect(scenes.at(-1)?.endSeconds).toBe(20);
    expect(scenes.every((scene) => scene.durationSeconds >= 4 && scene.durationSeconds <= 10)).toBe(true);
    expect(sceneAssets).toHaveLength(scenes.length);
    expect(render?.status).toBe('completed');
    expect(render?.durationSeconds).toBe(20);
    expect(render?.assetId).toBe(renderAsset?.id);
    expect(renderAsset?.mimeType).toBe('video/mp4');
    expect(readFileSync(resolve(renderAsset?.storagePath ?? '')).length).toBeGreaterThan(0);
    expect(processingJob?.status).toBe('completed');
    expect(processingJob?.progress).toBe(100);
    expect(processingJob?.errorMessage).toBeNull();
    expect(processingJob?.updatedAt.getTime()).toBeGreaterThan(processingJob?.createdAt.getTime() ?? 0);
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
      new ProcessingProgressService(prisma as unknown as WorkerPrismaService),
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
