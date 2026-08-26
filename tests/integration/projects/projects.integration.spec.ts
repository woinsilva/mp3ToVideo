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
  let sampleWavPath: string;

  beforeEach(async () => {
    uploadedFilePath = '';
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

    sampleWavPath = resolve('tests', 'tmp', `sample-${randomUUID()}.wav`);
    writeFileSync(sampleWavPath, Buffer.from('RIFF sample wav payload'));
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

    if (sampleWavPath && existsSync(sampleWavPath)) {
      rmSync(sampleWavPath, { force: true });
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
        title: 'My First Clip',
        clipDurationSeconds: 20,
        sceneDurationSeconds: 5,
        visualCheckpointName: 'sd_xl_turbo_1.0.safetensors',
        manualLyricsText: 'Linha um\nLinha dois'
      })
      .expect(201);

    expect(createResponse.body.title).toBe('My First Clip');
    expect(createResponse.body.clipDurationSeconds).toBe(20);
    expect(createResponse.body.sceneDurationSeconds).toBe(5);
    expect(createResponse.body.visualCheckpointName).toBe('sd_xl_turbo_1.0.safetensors');
    expect(createResponse.body.status).toBe('draft');
    expect(createResponse.body.lyrics).toEqual({
      source: 'manual',
      rawText: 'Linha um\nLinha dois',
      normalizedText: 'linha um linha dois'
    });

    const listResponse = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].title).toBe('My First Clip');
    expect(listResponse.body[0].clipDurationSeconds).toBe(20);
    expect(listResponse.body[0].sceneDurationSeconds).toBe(5);
    expect(listResponse.body[0].visualCheckpointName).toBe('sd_xl_turbo_1.0.safetensors');

    const detailResponse = await request(app.getHttpServer())
      .get(`/projects/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(detailResponse.body.id).toBe(createResponse.body.id);
    expect(detailResponse.body.clipDurationSeconds).toBe(20);
    expect(detailResponse.body.sceneDurationSeconds).toBe(5);
    expect(detailResponse.body.visualCheckpointName).toBe('sd_xl_turbo_1.0.safetensors');
    expect(detailResponse.body.status).toBe('draft');
    expect(detailResponse.body.lyrics).toEqual({
      source: 'manual',
      rawText: 'Linha um\nLinha dois',
      normalizedText: 'linha um linha dois'
    });
  });

  it('creates a children clip project and queues its dedicated audio analysis', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'A festa dos bichinhos',
        generationMode: 'children_clip',
        manualLyricsText: '[Verse]\nCada bichinho vai cantar',
        childrenClipConcept: 'Animais aprendem a plantar juntos em uma horta colorida.',
        childrenClipVisualStyle: 'Animacao 2D infantil original com formas arredondadas.',
        audienceAgeMin: 2,
        audienceAgeMax: 7,
        childrenClipAspectRatio: 'landscape_16_9'
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      generationMode: 'children_clip',
      status: 'draft',
      childrenClip: {
        concept: 'Animais aprendem a plantar juntos em uma horta colorida.',
        visualStyle: 'Animacao 2D infantil original com formas arredondadas.',
        audienceAgeMin: 2,
        audienceAgeMax: 7,
        aspectRatio: 'landscape_16_9',
        productionStatus: 'setup'
      }
    });

    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${createResponse.body.id}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('manualLyricsText', '[Verse]\nCada bichinho vai cantar')
      .attach('file', sampleMp3Path, {
        filename: 'suno-final.mp3',
        contentType: 'audio/mpeg'
      })
      .expect(201);

    expect(uploadResponse.body.status).toBe('queued');
    const processingJob = await prisma.processingJob.findFirst({ where: { projectId: createResponse.body.id } });
    expect(processingJob).toMatchObject({
      queueName: 'children-clip-production',
      jobName: 'children-clip.audio.analyze',
      status: 'queued'
    });

    const persisted = await prisma.project.findUnique({
      where: { id: createResponse.body.id },
      include: { childrenClip: true, track: true }
    });
    expect(persisted?.childrenClip?.productionStatus).toBe('analyzing_audio');
    expect(persisted?.track?.originalFileName).toBe('suno-final.mp3');
    await request(app.getHttpServer())
      .get(`/projects/${createResponse.body.id}/children-clip/audio-analysis`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.analysis.status).toBe('queued'));
    uploadedFilePath = resolve(persisted?.track?.storagePath ?? '');
  });

  it('uploads, versions and approves a children clip character', async () => {
    const projectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Turma da horta',
        generationMode: 'children_clip',
        manualLyricsText: 'Vamos todos plantar e cantar',
        childrenClipConcept: 'Uma turma aprende a cuidar de uma horta comunitaria.',
        childrenClipVisualStyle: 'Animacao 2D infantil colorida e original.',
        audienceAgeMin: 2,
        audienceAgeMax: 7,
        childrenClipAspectRatio: 'landscape_16_9'
      })
      .expect(201);

    const characterResponse = await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/characters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bibi',
        description: 'Coelhinha branca de vestido amarelo, orelhas rosas e tenis azuis.',
        sourceMode: 'uploaded',
        scope: 'organization',
        roleName: 'Protagonista',
        invariants: ['vestido amarelo', 'orelhas rosas', 'tenis azuis']
      })
      .expect(201);

    expect(characterResponse.body.versions[0]).toMatchObject({
      versionNumber: 1,
      origin: 'uploaded',
      status: 'draft'
    });

    const characterId = characterResponse.body.id;
    const versionId = characterResponse.body.versions[0].id;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAABoKxmiAAAADUlEQVR42mNk+M/wHwAF/gL+AvwNAAAAAElFTkSuQmCC',
      'base64'
    );
    const assetResponse = await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/characters/${characterId}/versions/${versionId}/assets`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('role', 'primary_reference')
      .field('label', 'Referencia principal')
      .attach('file', png, { filename: 'bibi.png', contentType: 'image/png' })
      .expect(201);

    expect(assetResponse.body).toMatchObject({ status: 'ready_for_review' });
    expect(assetResponse.body.assets[0]).toMatchObject({
      role: 'primary_reference',
      width: 2,
      height: 1
    });

    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/characters/${characterId}/versions/${versionId}/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('approved'));

    const listResponse = await request(app.getHttpServer())
      .get(`/projects/${projectResponse.body.id}/children-clip/characters`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(listResponse.body[0]).toMatchObject({
      name: 'Bibi',
      approvedVersionId: versionId,
      selectedVersionId: versionId
    });

    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/characters/${characterId}/versions/${versionId}/assets`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('role', 'mouth_shape')
      .attach('file', png, { filename: 'mouth.png', contentType: 'image/png' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/characters/${characterId}/versions/${versionId}/assets`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('role', 'mouth_shape')
      .field('label', 'A')
      .attach('file', png, { filename: 'mouth-a.png', contentType: 'image/png' })
      .expect(201)
      .expect(({ body }) => expect(body.assets.some((asset: { role: string; label: string }) => asset.role === 'mouth_shape' && asset.label === 'A')).toBe(true));
    const mouthAsset = await prisma.characterAsset.findFirst({ where: { characterVersionId: versionId, role: 'mouth_shape', label: 'A' } });
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/characters/${characterId}/versions/${versionId}/assets/${mouthAsset!.id}/reject`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.assets.find((asset: { id: string }) => asset.id === mouthAsset!.id).status).toBe('rejected'));

    const generatedPose = await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/characters/${characterId}/versions/${versionId}/assets/generate`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ role: 'pose', label: 'dançando com os braços levantados' })
      .expect(201);
    expect(generatedPose.body.assets.some((asset: { role: string; origin: string; status: string }) =>
      asset.role === 'pose' && asset.origin === 'generated' && asset.status === 'queued'
    )).toBe(true);

    const secondProject = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Outro clipe da Bibi', generationMode: 'children_clip', manualLyricsText: 'Bibi vai cantar',
        childrenClipConcept: 'Bibi visita um parque musical cheio de cores.',
        childrenClipVisualStyle: 'Animacao 2D infantil colorida e original.',
        audienceAgeMin: 2, audienceAgeMax: 7, childrenClipAspectRatio: 'landscape_16_9'
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/projects/${secondProject.body.id}/children-clip/characters/library`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect(({ body }) => expect(body[0]).toMatchObject({ id: characterId, approvedVersionId: versionId }));
    await request(app.getHttpServer())
      .post(`/projects/${secondProject.body.id}/children-clip/characters/library/${characterId}/attach`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ roleName: 'Protagonista convidada' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ id: characterId, selectedVersionId: versionId, roleName: 'Protagonista convidada' }));

    await prisma.childrenClipAudioAnalysis.create({
      data: {
        projectId: projectResponse.body.id,
        status: 'completed',
        durationSeconds: 12,
        bpm: 120,
        beatGrid: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12]
      }
    });
    await prisma.musicSection.create({
      data: { projectId: projectResponse.body.id, type: 'chorus', title: 'Chorus', startSeconds: 0, endSeconds: 12, energy: 0.8 }
    });
    await request(app.getHttpServer())
      .get(`/projects/${projectResponse.body.id}/children-clip/production-plan`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.readyToGenerate).toBe(true));
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-plan/generate`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.plan.status).toBe('queued'));

    await prisma.childrenClipPlan.update({
      where: { projectId: projectResponse.body.id },
      data: { status: 'ready_for_review', visualBible: { style: '2D' }, narrative: { summary: 'Horta feliz' } }
    });
    const productionLocation = await prisma.childrenClipLocation.create({
      data: {
        projectId: projectResponse.body.id,
        key: 'horta',
        name: 'Horta colorida',
        description: 'Horta infantil com canteiros e cerca clara',
        timeOfDay: 'manha clara',
        visualPrompt: 'Horta infantil vazia em 2D, canteiros e cerca clara'
      }
    });
    await prisma.childrenClipShot.createMany({ data: [
      { projectId: projectResponse.body.id, locationId: productionLocation.id, index: 0, title: 'Inicio', description: 'Plano geral dos canteiros durante o inicio do plantio.', purpose: 'Apresentar o plantio', primaryFocus: 'Bibi', startSeconds: 0, endSeconds: 6, durationSeconds: 6, framing: 'geral', cameraMovement: 'pan', characterAction: 'plantar', environment: 'horta', backgroundPrompt: 'horta 2D vazia com canteiros', characterVersionIds: [versionId], forbiddenEntityVersionIds: [] },
      { projectId: projectResponse.body.id, locationId: productionLocation.id, index: 1, title: 'Final', description: 'Plano medio dos canteiros durante a celebracao final.', purpose: 'Encerrar o plantio', primaryFocus: 'Bibi', startSeconds: 6, endSeconds: 12, durationSeconds: 6, framing: 'medio', cameraMovement: 'fixa', characterAction: 'cantar', environment: 'horta', backgroundPrompt: 'horta 2D vazia com canteiros', characterVersionIds: [versionId], forbiddenEntityVersionIds: [] }
    ] });
    const shots = await prisma.childrenClipShot.findMany({ where: { projectId: projectResponse.body.id }, orderBy: { index: 'asc' } });
    await request(app.getHttpServer())
      .patch(`/projects/${projectResponse.body.id}/children-clip/production-plan/shots/${shots[0].id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Abertura na horta', renderMode: 'animation_2d' })
      .expect(200)
      .expect(({ body }) => expect(body.shots[0].title).toBe('Abertura na horta'));
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-plan/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.plan.status).toBe('approved'));

    const descriptionsBeforeRegeneration = shots.map((shot) => shot.description);
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/shots/${shots[0].id}/generate`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ role: 'foreground', prompt: 'Regador infantil isolado em primeiro plano.' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.shots[0].assets).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'foreground', status: 'queued' })]));
        expect(body.shots[1].assets).toHaveLength(0);
        expect(body.shots.map((shot: { description: string }) => shot.description)).toEqual(descriptionsBeforeRegeneration);
      });

    const shotAssetResponse = await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/shots/${shots[0].id}/upload`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('role', 'background')
      .attach('file', png, { filename: 'horta.png', contentType: 'image/png' })
      .expect(201);
    const shotAsset = shotAssetResponse.body.shots[0].assets[0];
    expect(shotAsset).toMatchObject({
      role: 'background', origin: 'uploaded', status: 'ready_for_review', versionNumber: 1,
      asset: { mimeType: 'image/png', width: 2, height: 1 }
    });
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/${shotAsset.id}/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.shots[0].assets[0].status).toBe('approved');
        expect(body.summary).toMatchObject({ totalShots: 2, approvedBackgrounds: 1, readyForAnimation: false });
      });
    const poseResponse = await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/shots/${shots[0].id}/upload`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('role', 'character_pose')
      .field('characterVersionId', versionId)
      .attach('file', png, { filename: 'bibi-plantando.png', contentType: 'image/png' })
      .expect(201);
    const poseAsset = poseResponse.body.shots[0].assets.find((asset: { role: string }) => asset.role === 'character_pose');
    expect(poseAsset).toMatchObject({ characterVersionId: versionId, status: 'ready_for_review' });
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/${poseAsset.id}/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);
    const storyboardResponse = await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/shots/${shots[0].id}/upload`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('role', 'storyboard_frame')
      .attach('file', png, { filename: 'tomada-completa.png', contentType: 'image/png' })
      .expect(201);
    const storyboardAsset = storyboardResponse.body.shots[0].assets.find((asset: { role: string }) => asset.role === 'storyboard_frame');
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/${storyboardAsset.id}/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);
    const propResponse = await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/shots/${shots[0].id}/upload`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('role', 'prop')
      .attach('file', png, { filename: 'regador.png', contentType: 'image/png' })
      .expect(201);
    const propAsset = propResponse.body.shots[0].assets.find((asset: { role: string }) => asset.role === 'prop');
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-assets/${propAsset.id}/reject`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.shots[0].assets.find((asset: { id: string }) => asset.id === propAsset.id).status).toBe('rejected'));
    await request(app.getHttpServer())
      .get(`/projects/${projectResponse.body.id}/children-clip/production-assets/${shotAsset.id}/file`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect('Content-Type', /image\/png/);

    await prisma.childrenClipShot.update({ where: { id: shots[0].id }, data: { renderMode: 'hybrid' } });
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/output/shots/${shots[0].id}/wan`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.heroShots[0].latestAttempt).toMatchObject({ status: 'queued', progress: 0, stage: 'QUEUED' });
        expect(body.readyForFinal).toBe(false);
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/animation/shots/${shots[0].id}/render`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.shots[0].latestAttempt).toMatchObject({
          attemptNumber: 1, status: 'queued', progress: 0, stage: 'QUEUED', fps: 16,
          width: 1280, height: 720, frameCount: 96, hasVideo: false
        });
      });

    const preservedAssetId = shotAsset.id;
    const preservedShotIds = shots.map((shot) => shot.id);
    await request(app.getHttpServer())
      .post(`/projects/${projectResponse.body.id}/children-clip/production-plan/replan-shots`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ revisionInstruction: 'Tornar cada tomada especifica para sua letra.' })
      .expect(201)
      .expect(({ body }) => expect(body.plan.status).toBe('queued'));
    expect((await prisma.childrenClipShot.findMany({ where: { projectId: projectResponse.body.id }, orderBy: { index: 'asc' } })).map((shot) => shot.id)).toEqual(preservedShotIds);
    expect(await prisma.childrenClipShotAsset.findUnique({ where: { id: preservedAssetId } })).not.toBeNull();

    const characterAssetId = listResponse.body[0].versions[0].assets[0].id;
    const assetId = listResponse.body[0].versions[0].assets[0].assetId;
    await request(app.getHttpServer())
      .get(`/projects/${projectResponse.body.id}/children-clip/characters/${characterId}/versions/${versionId}/assets/${characterAssetId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect('Content-Type', /image\/png/);

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    uploadedFilePath = resolve(asset?.storagePath ?? '');
  });

  it('creates and immediately queues a reproducible Wan stability baseline from a prompt', async () => {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Wan stability baseline',
        generationMode: 'prompt',
        generationPrompt: 'A woman standing naturally in a quiet forest at golden hour.',
        clipDurationSeconds: 7,
        stabilityTest: true,
        wanOnly: true,
        generationSeed: 424242,
        generationCfg: 3.5,
        generationSteps: 28,
        generationFps: 24
      })
      .expect(201);

    expect(response.body).toMatchObject({
      generationMode: 'prompt',
      clipDurationSeconds: 7,
      stabilityTest: true,
      wanOnly: true,
      generationSeed: 424242,
      generationCfg: 3.5,
      generationSteps: 28,
      generationFps: 24,
      status: 'queued'
    });

    const project = await prisma.project.findUnique({ where: { id: response.body.id } });
    expect(project).toMatchObject({
      stabilityTest: true,
      wanOnly: true,
      generationSeed: 424242,
      generationCfg: 3.5,
      generationSteps: 28,
      generationFps: 24
    });
  });

  it('rejects unsupported native generation FPS values', async () => {
    await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Unsupported FPS',
        generationMode: 'prompt',
        generationPrompt: 'A cinematic scene with subtle natural movement.',
        clipDurationSeconds: 5,
        generationFps: 30
      })
      .expect(400);
  });

  it('persists a valid source image and queues an image-to-video project', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Image to video baseline',
        generationMode: 'image',
        generationPrompt: 'The subject walks slowly toward the fixed camera.',
        clipDurationSeconds: 3,
        stabilityTest: true,
        wanOnly: true,
        generationSeed: 777,
        generationCfg: 3.5,
        generationSteps: 24,
        generationFps: 16
      })
      .expect(201);

    expect(createResponse.body.status).toBe('draft');

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAABoKxmiAAAADUlEQVR42mNk+M/wHwAF/gL+AvwNAAAAAElFTkSuQmCC',
      'base64'
    );
    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${createResponse.body.id}/source-image`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', png, { filename: 'reference.png', contentType: 'image/png' })
      .expect(201);

    expect(uploadResponse.body).toMatchObject({
      generationMode: 'image',
      hasSourceImage: true,
      status: 'queued',
      sourceImage: {
        mimeType: 'image/png',
        width: 2,
        height: 1
      }
    });

    const project = await prisma.project.findUnique({
      where: { id: createResponse.body.id },
      include: { sourceImageAsset: true }
    });
    expect(project?.sourceImageAsset).toMatchObject({
      type: 'source_image',
      mimeType: 'image/png',
      width: 2,
      height: 1
    });
    uploadedFilePath = project?.sourceImageAsset?.storagePath ?? '';
    expect(existsSync(resolve(uploadedFilePath))).toBe(true);
  });

  it('rejects a file that only pretends to be a supported source image', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Invalid image project',
        generationMode: 'image',
        generationPrompt: 'The subject moves naturally toward the camera.',
        clipDurationSeconds: 2
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${createResponse.body.id}/source-image`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', Buffer.from('not-an-image'), {
        filename: 'fake.png',
        contentType: 'image/png'
      })
      .expect(400);
  });

  it('uploads an MP3 track, stores it on disk and preserves manual lyrics when provided', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Upload Flow',
        manualLyricsText: 'Hoje o celular vibrou diferente'
      })
      .expect(201);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${createResponse.body.id}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('manualLyricsText', 'Hoje o celular vibrou diferente')
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
    expect(processingJob?.detailMessage).toBe(
      'Projeto enfileirado. Aguardando worker iniciar o pipeline.'
    );
    expect(Array.isArray(processingJob?.activityLog)).toBe(true);

    const lyrics = await prisma.lyrics.findUnique({
      where: {
        projectId: createResponse.body.id
      }
    });

    expect(lyrics?.source).toBe('manual');
    expect(lyrics?.rawText).toBe('Hoje o celular vibrou diferente');

    uploadedFilePath = resolve(track?.storagePath ?? '');
    expect(existsSync(uploadedFilePath)).toBe(true);
    expect(readFileSync(uploadedFilePath).length).toBeGreaterThan(0);
  });

  it('reuploads audio for a failed project and requeues processing', async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: {
        email: 'owner@example.com'
      }
    });

    const project = await prisma.project.create({
      data: {
        organizationId,
        createdByUserId: owner.id,
        title: 'Failed Upload Recovery',
        clipDurationSeconds: 45,
        sceneDurationSeconds: 6,
        visualCheckpointName: 'old-model.safetensors',
        status: 'failed',
        errorMessage: 'missing source file',
        lyrics: {
          create: {
            source: 'manual',
            rawText: 'Letra antiga',
            normalizedText: 'letra antiga'
          }
        },
        track: {
          create: {
            originalFileName: 'old.wav',
            mimeType: 'audio/wav',
            sizeBytes: 111,
            storagePath: 'storage/uploads/old/path/original.wav'
          }
        }
      }
    });

    await prisma.asset.create({
      data: {
        organizationId,
        projectId: project.id,
        type: 'audio',
        mimeType: 'audio/wav',
        storagePath: 'storage/uploads/old/path/original.wav',
        sizeBytes: 111
      }
    });

    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${project.id}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('clipDurationSeconds', '20')
      .field('sceneDurationSeconds', '5')
      .field('visualCheckpointName', 'new-model.safetensors')
      .field('manualLyricsText', 'Letra atualizada')
      .attach('file', sampleMp3Path, {
        filename: 'replacement.mp3',
        contentType: 'audio/mpeg'
      })
      .expect(201);

    expect(uploadResponse.body.projectId).toBe(project.id);
    expect(uploadResponse.body.status).toBe('queued');

    const refreshedProject = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id
      }
    });
    const refreshedTrack = await prisma.track.findUniqueOrThrow({
      where: {
        projectId: project.id
      }
    });
    const audioAssets = await prisma.asset.findMany({
      where: {
        projectId: project.id,
        type: 'audio'
      }
    });
    const lyrics = await prisma.lyrics.findUniqueOrThrow({
      where: {
        projectId: project.id
      }
    });

    expect(refreshedProject.status).toBe('queued');
    expect(refreshedProject.errorMessage).toBeNull();
    expect(refreshedProject.clipDurationSeconds).toBe(20);
    expect(refreshedProject.sceneDurationSeconds).toBe(5);
    expect(refreshedProject.visualCheckpointName).toBe('new-model.safetensors');
    expect(refreshedTrack.originalFileName).toBe('replacement.mp3');
    expect(refreshedTrack.mimeType).toBe('audio/mpeg');
    expect(audioAssets).toHaveLength(1);
    expect(lyrics.source).toBe('manual');
    expect(lyrics.rawText).toBe('Letra atualizada');
  });

  it('uploads a WAV track, stores it with the original extension and updates project state', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Upload WAV Flow'
      })
      .expect(201);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/projects/${createResponse.body.id}/upload-track`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', sampleWavPath, {
        filename: 'track.wav',
        contentType: 'audio/wav'
      })
      .expect(201);

    expect(uploadResponse.body.projectId).toBe(createResponse.body.id);
    expect(uploadResponse.body.status).toBe('queued');

    const track = await prisma.track.findUnique({
      where: {
        projectId: createResponse.body.id
      }
    });

    expect(track?.originalFileName).toBe('track.wav');
    expect(track?.mimeType).toBe('audio/wav');
    expect(track?.storagePath.endsWith('original.wav')).toBe(true);

    uploadedFilePath = resolve(track?.storagePath ?? '');
    expect(existsSync(uploadedFilePath)).toBe(true);
    expect(readFileSync(uploadedFilePath).length).toBeGreaterThan(0);
  });

  it('rejects unsupported uploads', async () => {
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
        progress: 100,
        detailMessage: 'Pipeline concluido.',
        activityLog: [
          {
            stage: 'completed',
            message: 'Pipeline concluido.',
            provider: null,
            progress: 100,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });

    await prisma.lyrics.create({
      data: {
        projectId: project.id,
        source: 'whisper',
        rawText: 'Hello world\nWe keep moving',
        normalizedText: 'hello world we keep moving'
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
        provider: 'template',
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
      currentStep: 'Concluido',
      detailMessage: 'Pipeline concluido.',
      activityLog: [
        {
          stage: 'completed',
          message: 'Pipeline concluido.',
          provider: null,
          progress: 100,
          timestamp: expect.any(String)
        }
      ],
      lyrics: {
        source: 'whisper',
        rawText: 'Hello world\nWe keep moving',
        normalizedText: 'hello world we keep moving'
      },
      musicSections: [
        {
          type: 'verse',
          title: 'Verse 1',
          startSeconds: 0,
          endSeconds: 8,
          lyricsExcerpt: 'sample line',
          energy: 0.55
        }
      ],
      errorMessage: null,
      lastUpdatedAt: expect.any(String),
      renderRuntime: null,
      isPossiblyStalled: false
    });

    const scenesResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/scenes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(scenesResponse.body).toHaveLength(1);
    expect(scenesResponse.body[0].prompt.provider).toBe('template');
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

  it('requeues a failed project that already has an uploaded track', async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: {
        email: 'owner@example.com'
      }
    });

    const project = await prisma.project.create({
      data: {
        organizationId,
        createdByUserId: owner.id,
        title: 'Retry Project',
        clipDurationSeconds: 40,
        sceneDurationSeconds: 6,
        visualCheckpointName: 'sd_xl_turbo_1.0.safetensors',
        status: 'failed',
        errorMessage: 'render failed',
        lyrics: {
          create: {
            source: 'manual',
            rawText: 'Letra original',
            normalizedText: 'letra original'
          }
        },
        track: {
          create: {
            originalFileName: 'song.mp3',
            mimeType: 'audio/mpeg',
            sizeBytes: 1234,
            storagePath: 'storage/uploads/demo/retry/original.mp3'
          }
        }
      }
    });

    const retryResponse = await request(app.getHttpServer())
      .post(`/projects/${project.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        clipDurationSeconds: 20,
        sceneDurationSeconds: 5,
        visualCheckpointName: 'wan-image-fallback.safetensors',
        manualLyricsText: 'Letra revisada'
      })
      .expect(201);

    expect(retryResponse.body.id).toBe(project.id);
    expect(retryResponse.body.status).toBe('queued');
    expect(retryResponse.body.clipDurationSeconds).toBe(20);
    expect(retryResponse.body.sceneDurationSeconds).toBe(5);
    expect(retryResponse.body.visualCheckpointName).toBe('wan-image-fallback.safetensors');

    const refreshedProject = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id
      }
    });
    const processingJob = await prisma.processingJob.findFirst({
      where: {
        projectId: project.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    const lyrics = await prisma.lyrics.findUniqueOrThrow({
      where: {
        projectId: project.id
      }
    });

    expect(refreshedProject.status).toBe('queued');
    expect(refreshedProject.clipDurationSeconds).toBe(20);
    expect(refreshedProject.sceneDurationSeconds).toBe(5);
    expect(refreshedProject.visualCheckpointName).toBe('wan-image-fallback.safetensors');
    expect(refreshedProject.errorMessage).toBeNull();
    expect(lyrics.source).toBe('manual');
    expect(lyrics.rawText).toBe('Letra revisada');
    expect(processingJob?.status).toBe('queued');
    expect(processingJob?.progress).toBe(0);
    expect(processingJob?.detailMessage).toBe(
      'Projeto enfileirado. Aguardando worker iniciar o pipeline.'
    );
  });

  it('preserves generated scenes on retry when the project configuration is unchanged', async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: {
        email: 'owner@example.com'
      }
    });

    const project = await prisma.project.create({
      data: {
        organizationId,
        createdByUserId: owner.id,
        title: 'Resume Retry Project',
        clipDurationSeconds: 20,
        sceneDurationSeconds: 5,
        status: 'failed',
        errorMessage: 'scene 3 failed',
        lyrics: {
          create: {
            source: 'manual',
            rawText: 'Letra fixa',
            normalizedText: 'letra fixa'
          }
        },
        track: {
          create: {
            originalFileName: 'song.mp3',
            mimeType: 'audio/mpeg',
            sizeBytes: 1234,
            storagePath: 'storage/uploads/demo/retry/original.mp3'
          }
        }
      }
    });

    const section = await prisma.musicSection.create({
      data: {
        projectId: project.id,
        type: 'verse',
        title: 'Verse 1',
        startSeconds: 0,
        endSeconds: 5
      }
    });

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
        endSeconds: 5,
        durationSeconds: 5,
        status: 'completed',
        visualProvider: 'comfyui-video',
        videoAssetId: sceneAsset.id
      }
    });

    await prisma.scenePrompt.create({
      data: {
        sceneId: scene.id,
        provider: 'ollama',
        positivePrompt: 'positive prompt',
        negativePrompt: 'negative prompt',
        style: 'cinematic',
        camera: 'medium shot'
      }
    });

    await prisma.storyboard.create({
      data: {
        projectId: project.id,
        concept: 'Concept',
        visualStyle: 'cinematic',
        mood: 'upbeat',
        colorPalette: 'warm amber',
        narrativeSummary: 'Narrative'
      }
    });

    const retryResponse = await request(app.getHttpServer())
      .post(`/projects/${project.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(201);

    expect(retryResponse.body.id).toBe(project.id);
    expect(retryResponse.body.status).toBe('queued');

    const preservedScene = await prisma.scene.findUnique({
      where: {
        projectId_index: {
          projectId: project.id,
          index: 0
        }
      }
    });
    const preservedPrompt = await prisma.scenePrompt.findUnique({
      where: {
        sceneId: scene.id
      }
    });
    const preservedSection = await prisma.musicSection.findFirst({
      where: {
        projectId: project.id
      }
    });

    expect(preservedScene?.id).toBe(scene.id);
    expect(preservedScene?.status).toBe('completed');
    expect(preservedPrompt?.sceneId).toBe(scene.id);
    expect(preservedSection?.id).toBe(section.id);
  });

  it('requeues a completed project so scene reference images can be used in a new render', async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: {
        email: 'owner@example.com'
      }
    });

    const project = await prisma.project.create({
      data: {
        organizationId,
        createdByUserId: owner.id,
        title: 'Completed Retry Project',
        clipDurationSeconds: 20,
        sceneDurationSeconds: 5,
        status: 'completed',
        lyrics: {
          create: {
            source: 'manual',
            rawText: 'Letra fixa',
            normalizedText: 'letra fixa'
          }
        },
        track: {
          create: {
            originalFileName: 'song.mp3',
            mimeType: 'audio/mpeg',
            sizeBytes: 1234,
            storagePath: 'storage/uploads/demo/completed/original.mp3'
          }
        }
      }
    });

    const retryResponse = await request(app.getHttpServer())
      .post(`/projects/${project.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(201);

    expect(retryResponse.body.id).toBe(project.id);
    expect(retryResponse.body.status).toBe('queued');
  });

  it('rejects retry for projects that are neither failed nor completed', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Retry Guard Project'
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${createResponse.body.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);
  });
});
