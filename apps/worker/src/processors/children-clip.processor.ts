import { readFile, stat, writeFile } from 'node:fs/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetType, CharacterAssetRole, CharacterAssetStatus, CharacterVersionStatus, ChildrenClipShotAssetStatus, Prisma, ProcessingJobStatus, type ScenePrompt } from '@prisma/client';
import type { ChildrenClipAssetGenerationJobPayload, ChildrenClipAudioAnalysisJobPayload, ChildrenClipCharacterGenerationJobPayload, ChildrenClipPlanGenerationJobPayload } from '@video/shared';
import type { ChildrenClipShotRenderJobPayload } from '@video/shared';
import type { ChildrenClipFinalRenderJobPayload, ChildrenClipHeroShotJobPayload } from '@video/shared';
import { buildMouthFrames, type CharacterLayer, type TimedWord } from '@video/children-clip-renderer';
import type { Job } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { ComfyUiClientService } from '../services/comfyui-client.service';
import { RenderStorageService } from '../services/render-storage.service';
import { OllamaClientService } from '../services/ollama-client.service';
import { ChildrenClipAudioAnalysisService, type AudioEnergyPoint } from '../services/children-clip-audio-analysis.service';
import { ChildrenClipLyricsAlignmentService } from '../services/children-clip-lyrics-alignment.service';
import { MusicStructureService } from '../services/music-structure.service';
import { ChildrenClipPlanningService, type CreativePlanResponse, type CreativeShotPlan } from '../services/children-clip-planning.service';
import { ChildrenClipShotPromptService } from '../services/children-clip-shot-prompt.service';
import { ChildrenClip2dRendererService } from '../services/children-clip-2d-renderer.service';
import { VideoMetadataProbeService } from '../services/video-metadata-probe.service';
import { SceneVideoGenerationService } from '../services/scene-video-generation.service';
import { VideoGenerationSettingsService } from '../services/video-generation-settings.service';
import { ChildrenClipCompositionService } from '../services/children-clip-composition.service';

interface OptimizedCharacterPrompt {
  positivePrompt: string;
  negativePrompt: string;
}

interface ShotPlanningDraft {
  version: 2;
  signature: string;
  globalCreative?: CreativePlanResponse | null;
  batches: Array<{ batchIndex: number; response: CreativePlanResponse }>;
  repairs?: CreativePlanResponse[];
  audits?: Array<{ batchIndex: number; response: CreativePlanResponse }>;
}

interface HeroVideoRequest {
  provider: 'local' | 'snapgen';
  prompt: string;
  referenceAssetIds: string[];
  firstImageAssetId?: string | null;
  lastImageAssetId?: string | null;
  ingredientAssetIds?: string[];
  model?: 'veo-3.1-fast';
  resolution?: '720p' | '1080p';
  durationSeconds?: 8;
  aspectRatio?: '16:9' | '9:16';
  referenceMode?: 'frame' | 'ingredient';
}

@Injectable()
export class ChildrenClipProcessor {
  private readonly logger = new Logger(ChildrenClipProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ComfyUiClientService) private readonly comfyUi: ComfyUiClientService,
    @Inject(RenderStorageService) private readonly storage: RenderStorageService,
    @Inject(OllamaClientService) private readonly ollama: OllamaClientService,
    @Inject(ChildrenClipAudioAnalysisService)
    private readonly audioAnalysis: ChildrenClipAudioAnalysisService,
    @Inject(ChildrenClipLyricsAlignmentService)
    private readonly lyricsAlignment: ChildrenClipLyricsAlignmentService,
    @Inject(MusicStructureService) private readonly musicStructure: MusicStructureService,
    @Inject(ChildrenClipPlanningService) private readonly planning: ChildrenClipPlanningService,
    @Inject(ChildrenClipShotPromptService) private readonly shotPrompts: ChildrenClipShotPromptService
    , @Inject(ChildrenClip2dRendererService) private readonly renderer2d: ChildrenClip2dRendererService
    , @Inject(VideoMetadataProbeService) private readonly videoProbe: VideoMetadataProbeService
    , @Inject(SceneVideoGenerationService) private readonly sceneVideo: SceneVideoGenerationService
    , @Inject(VideoGenerationSettingsService) private readonly videoSettings: VideoGenerationSettingsService
    , @Inject(ChildrenClipCompositionService) private readonly composition: ChildrenClipCompositionService
  ) {}

  async processHeroShot(job: Job<ChildrenClipHeroShotJobPayload>) {
    const { projectId, organizationId, heroAttemptId } = job.data;
    const attempt = await this.prisma.childrenClipHeroShotAttempt.findFirst({
      where: { id: heroAttemptId, shot: { projectId, project: { organizationId, deletedAt: null } } },
      include: { shot: { include: { assets: { where: { status: 'approved' }, include: { asset: true } }, project: { include: { childrenClip: true, childrenClipPlan: true, childrenClipStyleProfile: true } } } } }
    });
    if (!attempt) throw new Error(`Hero shot attempt ${heroAttemptId} not found`);
    const request = attempt.requestMetadata as unknown as HeroVideoRequest | null;
    if (!request?.provider || !request.prompt || !request.referenceAssetIds?.length) throw new Error('A tentativa nao possui uma configuracao de video valida');
    const references = await this.prisma.asset.findMany({ where: { id: { in: request.referenceAssetIds }, projectId, organizationId } });
    const referenceMap = new Map(references.map((asset) => [asset.id, asset]));
    const orderedReferences = request.referenceAssetIds.map((id) => referenceMap.get(id)).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
    if (orderedReferences.length !== request.referenceAssetIds.length) throw new Error('Uma ou mais referencias da tentativa nao estao mais disponiveis');
    const reference = orderedReferences[0];
    const lockedStyle = this.styleLockPrompt(attempt.shot.project.childrenClipStyleProfile);
    const prompt = {
      positivePrompt: request.prompt || [lockedStyle.positive, attempt.shot.description, attempt.shot.characterAction, attempt.shot.environment, 'original safe children animation, preserve the supplied visual identity and composition, smooth subtle motion'].filter(Boolean).join('. '),
      negativePrompt: [...lockedStyle.negative, 'photorealistic, scary, violence, text, watermark, morphing, identity change, extra limbs, deformed anatomy, scene transition, camera shake'].join(', ')
    } as ScenePrompt;
    const settings = this.videoSettings.resolve(prompt, attempt.shot.durationSeconds, {
      seed: attempt.seed, fps: attempt.fps, width: attempt.width, height: attempt.height,
      cfg: attempt.shot.project.generationCfg, steps: attempt.shot.project.generationSteps,
      imageToVideo: true, stabilityTest: true
    });
    const isSnapGen = request.provider === 'snapgen';

    let submittedPromptId: string | null = null;
    const startedAt = new Date();
    let firstExternalSeenAt = attempt.firstExternalSeenAt;
    await this.prisma.$transaction([
      this.prisma.childrenClipHeroShotAttempt.update({ where: { id: heroAttemptId }, data: { status: 'generating', progress: 3, stage: 'STARTING', errorMessage: null, generationStartedAt: startedAt, generationEndedAt: null } }),
      this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'generating_hero_shots' } })
    ]);
    try {
      await this.heroProgress(job, heroAttemptId, 3, 'STARTING', `Worker iniciou a tomada especial ${isSnapGen ? 'SnapGen' : 'Wan'}.`);
      await this.heroProgress(job, heroAttemptId, 10, 'PREPARING_REFERENCE', `Preparando ${orderedReferences.length} referencia(s) aprovada(s).`);

      const result = await this.sceneVideo.generate({
        ...settings, sceneId: attempt.shotId, positivePrompt: settings.positivePrompt,
        negativePrompt: settings.negativePrompt, width: settings.width, height: settings.height,
        durationSeconds: settings.effectiveDurationSeconds,
        referenceImagePath: this.storage.getAbsolutePath(reference.storagePath),
        provider: isSnapGen ? 'snapgen' : 'comfyui',
        ...(isSnapGen ? {
          snapGenSettings: {
            model: request.model ?? 'veo-3.1-fast',
            resolution: request.resolution ?? '720p',
            durationSeconds: 8 as const,
            aspectRatio: request.aspectRatio ?? '16:9',
            modeImage: request.referenceMode ?? 'frame',
            referenceImagePaths: orderedReferences.map((asset) => this.storage.getAbsolutePath(asset.storagePath))
          }
        } : {}),
        onGpuWaiting: isSnapGen ? undefined : (owner) => this.heroProgress(
          job,
          heroAttemptId,
          12,
          'WAITING_GPU',
          `Tomada Wan aguardando a GPU local${owner ? `, atualmente ocupada por ${owner.split(':')[0]}` : ''}.`
        ),
        onSubmitted: async (promptId) => {
          submittedPromptId = promptId;
          await this.prisma.childrenClipHeroShotAttempt.update({ where: { id: heroAttemptId }, data: { promptId, externalJobId: isSnapGen ? promptId : null, submittedAt: new Date(), stage: 'SUBMITTED', progress: 18 } });
          await this.heroProgress(job, heroAttemptId, 18, 'SUBMITTED', `Workflow enviado ao ${isSnapGen ? 'SnapGen' : 'ComfyUI'} (${promptId}).`);
        },
        onHeartbeat: async (heartbeat) => {
          const progress = heartbeat.statusPercentage == null ? Math.min(78, 20 + heartbeat.pollCount) : Math.min(78, Math.max(20, Math.round(20 + heartbeat.statusPercentage * 0.58)));
          if (heartbeat.state === 'history_seen' && !firstExternalSeenAt) firstExternalSeenAt = new Date();
          await this.prisma.childrenClipHeroShotAttempt.update({ where: { id: heroAttemptId }, data: {
            lastHeartbeatAt: new Date(), firstExternalSeenAt: heartbeat.state === 'history_seen' ? firstExternalSeenAt : undefined,
            generationManifest: { request, externalJobId: heartbeat.promptId, externalStatus: heartbeat.externalStatus ?? null, statusPercentage: heartbeat.statusPercentage ?? null, estimatedCredit: heartbeat.estimatedCredit ?? null, usedCredit: heartbeat.usedCredit ?? null, elapsedMs: heartbeat.elapsedMs } as unknown as Prisma.InputJsonValue
          } });
          await this.heroProgress(job, heroAttemptId, progress, heartbeat.state === 'waiting' ? 'WAITING_EXTERNAL' : 'CONFIRMED_EXTERNAL_ACTIVE', `${isSnapGen ? 'SnapGen' : 'ComfyUI'} processando a tomada ha ${Math.round(heartbeat.elapsedMs / 1000)}s.`);
        }
      });

      if (!result) throw new Error(`O provider ${isSnapGen ? 'SnapGen' : 'Wan'} nao retornou um video`);
      await this.heroProgress(job, heroAttemptId, 82, 'SAVING_VIDEO', `Salvando a tomada ${isSnapGen ? 'SnapGen' : 'Wan'} versionada.`);
      const outputPath = this.storage.buildChildrenClipHeroShotPath(organizationId, projectId, attempt.shotId, attempt.attemptNumber);
      const absolutePath = await this.storage.ensureParentDirectory(outputPath);

      await writeFile(absolutePath, result.buffer);

      await this.prisma.childrenClipHeroShotAttempt.update({ where: { id: heroAttemptId }, data: { status: 'validating', progress: 90, stage: 'VALIDATING' } });
      await this.heroProgress(job, heroAttemptId, 90, 'VALIDATING', `Validando o video retornado pelo ${isSnapGen ? 'SnapGen' : 'Wan'}.`);

      const metadata = await this.videoProbe.probe(absolutePath);
      if (!metadata.frameCount || !metadata.durationSeconds || !metadata.width || !metadata.height) throw new Error(`O video ${isSnapGen ? 'SnapGen' : 'Wan'} retornado e invalido ou incompleto`);
      const sizeBytes = Number((await stat(absolutePath)).size);

      const manifest: Record<string, unknown> = { provider: result.provider, externalJobId: submittedPromptId, request, referenceAssetIds: request.referenceAssetIds, ...settings, ...result.metadata, validation: metadata };

      await this.prisma.$transaction(async (tx) => {
        if (result.lastFrame) {
          const lastFramePath = this.storage.buildChildrenClipHeroLastFramePath(organizationId, projectId, attempt.shotId, attempt.attemptNumber, result.lastFrame.mimeType);
          const lastFrameAbsolutePath = await this.storage.ensureParentDirectory(lastFramePath);
          await writeFile(lastFrameAbsolutePath, result.lastFrame.buffer);
          const lastFrameAsset = await tx.asset.create({ data: { organizationId, projectId, type: 'image', mimeType: result.lastFrame.mimeType, storagePath: lastFramePath, sizeBytes: result.lastFrame.buffer.byteLength, metadata: { source: 'snapgen-last-frame', heroAttemptId } } });
          manifest.lastFrameAssetId = lastFrameAsset.id;
        }
        const asset = await tx.asset.create({ data: { organizationId, projectId, type: 'video_scene', mimeType: 'video/mp4', storagePath: outputPath, sizeBytes, width: metadata.width, height: metadata.height, metadata: manifest as unknown as Prisma.InputJsonValue } });
        const endedAt = new Date();
        await tx.childrenClipHeroShotAttempt.update({ where: { id: heroAttemptId }, data: { assetId: asset.id, status: 'ready_for_review', progress: 100, stage: 'READY_FOR_REVIEW', generationManifest: manifest as unknown as Prisma.InputJsonValue, generationEndedAt: endedAt, durationMs: endedAt.getTime() - startedAt.getTime(), errorMessage: null } });
      });
      await this.heroProgress(job, heroAttemptId, 100, 'READY_FOR_REVIEW', `Tomada ${isSnapGen ? 'SnapGen' : 'Wan'} pronta para revisao.`, ProcessingJobStatus.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      const endedAt = new Date();
      await this.prisma.childrenClipHeroShotAttempt.update({ where: { id: heroAttemptId }, data: { status: willRetry ? 'queued' : 'failed', progress: 0, stage: willRetry ? 'RETRYING' : 'FAILED', errorMessage: message, generationEndedAt: willRetry ? null : endedAt, durationMs: willRetry ? null : endedAt.getTime() - startedAt.getTime(), generationManifest: { request, externalJobId: submittedPromptId, error: { code: this.heroErrorCode(message), message } } as unknown as Prisma.InputJsonValue } });
      await this.heroProgress(job, heroAttemptId, 0, willRetry ? 'RETRYING' : 'FAILED', willRetry ? `${isSnapGen ? 'SnapGen' : 'Wan'} falhou; o BullMQ tentara novamente: ${message}` : `Falha na tomada ${isSnapGen ? 'SnapGen' : 'Wan'}: ${message}`, willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed, message);
      throw error;
    }
  }

  async processFinalRender(job: Job<ChildrenClipFinalRenderJobPayload>) {
    const { projectId, organizationId, finalRenderId } = job.data;
    const render = await this.prisma.childrenClipFinalRender.findFirst({
      where: { id: finalRenderId, projectId, project: { organizationId, deletedAt: null } },
      include: { project: { include: { childrenClip: true, track: true, childrenClipAudioAnalysis: true, childrenClipShots: { orderBy: { index: 'asc' }, include: { renderAttempts: { where: { status: 'completed' }, orderBy: { attemptNumber: 'desc' }, take: 1, include: { asset: true } }, heroShotAttempts: { where: { status: 'approved' }, orderBy: { attemptNumber: 'desc' }, take: 1, include: { asset: true } } } } } } }
    });
    if (!render?.project.track) throw new Error('A musica original do clipe nao foi encontrada');
    const shots = render.project.childrenClipShots.map((shot) => {
      const hero = shot.heroShotAttempts[0]?.asset;
      const twoD = shot.renderAttempts[0]?.asset;
      const asset = ['wan', 'snapgen'].includes(shot.renderMode) ? hero : hero ?? twoD;
      if (!asset) throw new Error(`A tomada ${shot.index + 1} nao possui render aprovado`);
      return { shot, asset, source: hero ? (shot.heroShotAttempts[0]?.provider ?? 'comfyui-video') : 'animation_2d' };
    });
    const fps = render.project.generationFps || 16;
    const portrait = render.project.childrenClip?.aspectRatio === 'portrait_9_16';
    const square = render.project.childrenClip?.aspectRatio === 'square_1_1';
    const width = portrait ? 720 : square ? 1080 : 1280;
    const height = portrait ? 1280 : square ? 1080 : 720;
    const duration = render.project.childrenClipAudioAnalysis?.durationSeconds ?? shots[shots.length - 1].shot.endSeconds;
    await this.prisma.$transaction([
      this.prisma.childrenClipFinalRender.update({ where: { id: finalRenderId }, data: { status: 'compositing', progress: 3, stage: 'STARTING', errorMessage: null, renderStartedAt: new Date(), renderCompletedAt: null } }),
      this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'compositing' } })
    ]);
    try {
      await this.finalProgress(job, finalRenderId, 3, 'STARTING', 'Worker iniciou a composicao final.');
      const manifest = { version: render.versionNumber, fps, width, height, durationSeconds: duration, trackId: render.project.track.id, shots: shots.map(({ shot, asset, source }) => ({ shotId: shot.id, index: shot.index, source, assetId: asset.id, startSeconds: shot.startSeconds, endSeconds: shot.endSeconds, durationSeconds: shot.durationSeconds })) };
      await this.prisma.childrenClipFinalRender.update({ where: { id: finalRenderId }, data: { renderManifest: manifest as unknown as Prisma.InputJsonValue } });
      const outputPath = this.storage.buildChildrenClipFinalRenderPath(organizationId, projectId, render.versionNumber);
      await this.composition.compose({ projectId, finalRenderId, clips: shots.map(({ shot, asset }) => ({ path: asset.storagePath, durationSeconds: shot.durationSeconds })), audioPath: render.project.track.storagePath, outputPath, width, height, fps, totalDuration: duration, onProgress: (progress, stage, message) => this.finalProgress(job, finalRenderId, progress, stage, message) });
      await this.prisma.childrenClipFinalRender.update({ where: { id: finalRenderId }, data: { status: 'validating', progress: 92, stage: 'VALIDATING' } });
      await this.finalProgress(job, finalRenderId, 92, 'VALIDATING', 'Validando video, audio, dimensoes, FPS e duracao final.');
      const absolutePath = this.storage.getAbsolutePath(outputPath);
      const metadata = await this.videoProbe.probe(absolutePath);
      if (!metadata.hasAudio) throw new Error('O clipe final nao possui faixa de audio');
      if (metadata.width !== width || metadata.height !== height) throw new Error('O clipe final possui dimensoes invalidas');
      if (!metadata.durationSeconds || Math.abs(metadata.durationSeconds - duration) > 0.15) throw new Error('O clipe final diverge da duracao da musica');
      const sizeBytes = Number((await stat(absolutePath)).size);
      await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({ data: { organizationId, projectId, type: 'render', mimeType: 'video/mp4', storagePath: outputPath, sizeBytes, width, height, metadata: { ...manifest, validation: metadata } as unknown as Prisma.InputJsonValue } });
        await tx.childrenClipFinalRender.update({ where: { id: finalRenderId }, data: { assetId: asset.id, status: 'completed', progress: 100, stage: 'COMPLETED', renderCompletedAt: new Date(), errorMessage: null } });
        await tx.childrenClip.update({ where: { projectId }, data: { productionStatus: 'completed' } });
        await tx.project.update({ where: { id: projectId }, data: { status: 'completed', errorMessage: null } });
      });
      await this.finalProgress(job, finalRenderId, 100, 'COMPLETED', 'Clipe infantil finalizado e validado.', ProcessingJobStatus.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await this.prisma.childrenClipFinalRender.update({ where: { id: finalRenderId }, data: { status: willRetry ? 'queued' : 'failed', progress: 0, stage: willRetry ? 'RETRYING' : 'FAILED', errorMessage: message, renderCompletedAt: willRetry ? null : new Date() } });
      await this.finalProgress(job, finalRenderId, 0, willRetry ? 'RETRYING' : 'FAILED', willRetry ? `Composicao falhou; o BullMQ tentara novamente: ${message}` : `Falha na composicao final: ${message}`, willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed, message);
      throw error;
    }
  }

  async processShotRender(job: Job<ChildrenClipShotRenderJobPayload>) {
    const { projectId, organizationId, renderAttemptId } = job.data;
    const bullJobId = String(job.id);
    const attempt = await this.prisma.childrenClipShotRenderAttempt.findFirst({
      where: { id: renderAttemptId, shot: { projectId, project: { organizationId, deletedAt: null } } },
      include: {
        shot: {
          include: {
            assets: { where: { status: 'approved' }, include: { asset: true } },
            project: {
              include: {
                childrenClip: true, childrenClipPlan: true, childrenClipAudioAnalysis: true,
                childrenClipLyricCues: { orderBy: { lineIndex: 'asc' } },
                characterLinks: {
                  orderBy: { sortOrder: 'asc' },
                  include: { character: true, selectedVersion: { include: { assets: { where: { status: 'approved', assetId: { not: null } }, include: { asset: true } } } } }
                }
              }
            }
          }
        }
      }
    });
    if (!attempt) throw new Error(`Render attempt ${renderAttemptId} not found`);
    const storyboard = attempt.shot.assets.find((item) => item.role === 'storyboard_frame' && item.asset);
    const background = attempt.shot.assets.find((item) => item.role === 'background' && item.asset);
    const visualBase = storyboard ?? background;
    if (!visualBase?.asset) throw new Error('A tomada nao possui storyboard ou fundo aprovado');
    const project = attempt.shot.project;
    const versionIds = this.stringArray(attempt.shot.characterVersionIds);
    const hasExplicitEntitySelection = Array.isArray(attempt.shot.characterVersionIds);
    const characterLinks = project.characterLinks.filter((link) =>
      link.selectedVersion && (!hasExplicitEntitySelection || versionIds.includes(link.selectedVersion.id))
    );

    await this.prisma.$transaction([
      this.prisma.childrenClipShotRenderAttempt.update({
        where: { id: renderAttemptId },
        data: { status: 'rendering', bullJobId, progress: 2, stage: 'STARTING', errorMessage: null, renderStartedAt: new Date(), renderCompletedAt: null }
      }),
      this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'animating' } })
    ]);
    try {
      await this.renderProgress(job, renderAttemptId, 2, 'STARTING', 'Worker iniciou o render 2D da tomada.');
      await this.renderProgress(job, renderAttemptId, 5, 'BUILDING_MANIFEST', 'Montando camadas, batidas e formas de boca.');
      const timedWords = project.childrenClipLyricCues.flatMap((cue) => {
        if (cue.endSeconds <= attempt.shot.startSeconds || cue.startSeconds >= attempt.shot.endSeconds) return [];
        return this.timedWords(cue.words, cue.text, cue.startSeconds, cue.endSeconds);
      });
      const baseMouthFrames = buildMouthFrames(timedWords, attempt.fps, attempt.shot.startSeconds)
        .filter((frame) => frame.startFrame < attempt.frameCount);
      const poseAssets = attempt.shot.assets.filter((item) => item.role === 'character_pose' && item.asset);
      const characters: CharacterLayer[] = [];
      for (let index = 0; !storyboard && index < characterLinks.length; index += 1) {
        const link = characterLinks[index];
        const version = link.selectedVersion!;
        const pose = poseAssets.find((item) => item.characterVersionId === version.id)?.asset
          ?? version.assets.find((item) => item.role === 'pose')?.asset
          ?? version.assets.find((item) => item.role === 'front_view')?.asset;
        if (!pose) throw new Error(`A tomada requer storyboard aprovado ou pose isolada aprovada para ${link.character.name}`);
        const mouths = version.assets.filter((item) => item.role === 'mouth_shape' && item.status === 'approved' && item.asset);
        const mouthSources = new Map<string, string>();
        for (const mouth of mouths) {
          const key = (mouth.label || '').trim().toLowerCase();
          if (key && mouth.asset) mouthSources.set(key, await this.assetDataUrl(mouth.asset.storagePath, mouth.asset.mimeType));
        }
        const width = characterLinks.length === 1 ? 42 : Math.min(34, 72 / characterLinks.length);
        const x = characterLinks.length === 1 ? 29 : 8 + index * (84 / characterLinks.length);
        characters.push({
          id: version.id, name: link.character.name,
          src: await this.assetDataUrl(pose.storagePath, pose.mimeType),
          x, y: 20, width, height: 72, mouthX: 41, mouthY: 27, mouthWidth: 18,
          mouthFrames: baseMouthFrames.map((frame) => ({
            ...frame,
            src: mouthSources.get(frame.shape.toLowerCase()) ??
              (frame.shape === 'closed' ? mouthSources.get('closed') ?? mouthSources.get('rest') : null)
          }))
        });
      }
      const foreground = attempt.shot.assets.find((item) => item.role === 'foreground' && item.asset)?.asset;
      const beats = this.numberArray(project.childrenClipAudioAnalysis?.beatGrid ?? null)
        .filter((beat) => beat >= attempt.shot.startSeconds && beat < attempt.shot.endSeconds)
        .map((beat) => Math.round((beat - attempt.shot.startSeconds) * attempt.fps));
      const props = {
        width: attempt.width, height: attempt.height, fps: attempt.fps, durationInFrames: attempt.frameCount,
        backgroundSrc: await this.assetDataUrl(visualBase.asset.storagePath, visualBase.asset.mimeType),
        foregroundSrc: foreground ? await this.assetDataUrl(foreground.storagePath, foreground.mimeType) : null,
        characters, lyricText: attempt.shot.lyricText, motionPreset: attempt.shot.motionPreset,
        transitionIn: attempt.shot.transitionIn, transitionOut: attempt.shot.transitionOut, beatFrames: beats
      };
      const manifest = {
        renderer: 'remotion', rendererVersion: 1, renderAttemptId, shotId: attempt.shotId,
        fps: attempt.fps, frameCount: attempt.frameCount, width: attempt.width, height: attempt.height,
        backgroundShotAssetId: visualBase.id, storyboardShotAssetId: storyboard?.id ?? null,
        foregroundShotAssetId: foreground ? attempt.shot.assets.find((item) => item.assetId === foreground.id)?.id : null,
        characterVersionIds: characters.map((item) => item.id), timedWordCount: timedWords.length,
        mouthFrameCount: baseMouthFrames.length, beatFrames: beats, motionPreset: attempt.shot.motionPreset
      };
      await this.prisma.childrenClipShotRenderAttempt.update({ where: { id: renderAttemptId }, data: { renderManifest: manifest } });
      const outputPath = this.storage.buildChildrenClipShotRenderPath(organizationId, projectId, attempt.shotId, attempt.attemptNumber);
      const absolutePath = await this.storage.ensureParentDirectory(outputPath);
      await this.renderer2d.render(props, absolutePath, (progress, stage, message) => this.renderProgress(job, renderAttemptId, progress, stage, message));
      await this.renderProgress(job, renderAttemptId, 96, 'VALIDATING', 'Validando FPS, frames, dimensoes e duracao da tomada.');
      const metadata = await this.videoProbe.probe(absolutePath);
      const expectedDuration = attempt.frameCount / attempt.fps;
      if (metadata.width !== attempt.width || metadata.height !== attempt.height) throw new Error('O render 2D possui dimensoes inesperadas');
      if (!metadata.durationSeconds || Math.abs(metadata.durationSeconds - expectedDuration) > 2 / attempt.fps) throw new Error('O render 2D possui duracao divergente da timeline');
      const sizeBytes = Number((await stat(absolutePath)).size);
      await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            organizationId, projectId, type: AssetType.video_scene, mimeType: 'video/mp4', storagePath: outputPath,
            sizeBytes, width: attempt.width, height: attempt.height,
            metadata: { ...manifest, validation: metadata } as unknown as Prisma.InputJsonValue
          }
        });
        await tx.childrenClipShotRenderAttempt.update({
          where: { id: renderAttemptId },
          data: { assetId: asset.id, status: 'completed', progress: 100, stage: 'COMPLETED', renderCompletedAt: new Date(), errorMessage: null }
        });
      });
      await this.renderProgress(job, renderAttemptId, 100, 'COMPLETED', 'Tomada 2D renderizada e validada.', ProcessingJobStatus.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await this.prisma.childrenClipShotRenderAttempt.update({
        where: { id: renderAttemptId },
        data: { status: willRetry ? 'queued' : 'failed', progress: 0, stage: willRetry ? 'RETRYING' : 'FAILED', errorMessage: message, renderCompletedAt: willRetry ? null : new Date() }
      });
      await this.renderProgress(job, renderAttemptId, 0, willRetry ? 'RETRYING' : 'FAILED', willRetry ? `Render falhou; o BullMQ tentara novamente: ${message}` : `Falha no render 2D: ${message}`, willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed, message);
      throw error;
    }
  }

  async processAssetGeneration(job: Job<ChildrenClipAssetGenerationJobPayload>) {
    const { projectId, organizationId, shotAssetId } = job.data;
    const bullJobId = String(job.id);
    const shotAsset = await this.prisma.childrenClipShotAsset.findFirst({
      where: { id: shotAssetId, shot: { projectId, project: { organizationId, deletedAt: null } } },
      include: {
        shot: {
          include: {
            assets: {
              where: { assetId: { not: null }, status: { in: ['ready_for_review', 'approved'] } },
              include: { asset: true },
              orderBy: { createdAt: 'desc' }
            },
            location: { include: { masterBackgroundAsset: { include: { childrenClipShotAsset: true } } } },
            project: {
              include: {
                childrenClip: true,
                childrenClipPlan: true,
                childrenClipStyleProfile: true,
                characterLinks: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    character: true,
                    selectedVersion: {
                      include: {
                        assets: {
                          where: { status: 'approved', assetId: { not: null } },
                          include: { asset: true },
                          orderBy: { sortOrder: 'asc' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!shotAsset?.generationPrompt) throw new Error(`Shot asset ${shotAssetId} is not ready for generation`);
    if (shotAsset.shot.project.childrenClipPlan?.status !== 'approved') {
      throw new Error('O plano de producao deixou de estar aprovado');
    }

    const seed = shotAsset.seed ?? Math.floor(Math.random() * 2_147_483_646);
    const checkpointName = this.config.get<string>('visual.characterCheckpointName', '').trim();
    const aspectRatio = shotAsset.shot.project.childrenClip?.aspectRatio ?? 'landscape_16_9';
    const dimensions = aspectRatio === 'portrait_9_16'
      ? { width: 768, height: 1344 }
      : aspectRatio === 'square_1_1'
        ? { width: 1024, height: 1024 }
        : { width: 1344, height: 768 };
    const steps = this.config.get<number>('visual.characterSteps', 30);
    const cfg = this.config.get<number>('visual.characterCfg', 6.5);
    const sampler = this.config.get<string>('visual.characterSampler', 'dpmpp_2m');
    const scheduler = this.config.get<string>('visual.characterScheduler', 'karras');
    const loraName = this.config.get<string>('visual.characterLoraName', '').trim();
    const loraStrength = this.config.get<number>('visual.characterLoraStrength', 1);
    const visualBible = shotAsset.shot.project.childrenClipPlan?.visualBible;
    const bible = visualBible && typeof visualBible === 'object' && !Array.isArray(visualBible) ? visualBible as Record<string, unknown> : {};
    const characterRules = Array.isArray(bible.characterRules) ? bible.characterRules : [];
    const entities = shotAsset.shot.project.characterLinks.flatMap((link) => {
      if (!link.selectedVersion) return [];
      const rule = characterRules.find((item) => item && typeof item === 'object' && !Array.isArray(item) && String((item as Record<string, unknown>).name ?? '').toLowerCase() === link.character.name.toLowerCase()) as Record<string, unknown> | undefined;
      const reference = link.selectedVersion.assets.find((item) => item.role === 'primary_reference' && item.asset)
        ?? link.selectedVersion.assets.find((item) => item.asset);
      return [{
        versionId: link.selectedVersion.id,
        name: link.character.name,
        type: typeof rule?.type === 'string' ? rule.type : 'character',
        identity: typeof rule?.identity === 'string' ? rule.identity : link.selectedVersion.description,
        referenceAsset: reference?.asset ? {
          id: reference.asset.id,
          storagePath: reference.asset.storagePath,
          width: reference.asset.width,
          height: reference.asset.height,
          generatedTurnaround: reference.origin === 'generated' && reference.role === 'primary_reference'
        } : null
      }];
    });
    const styleProfile = shotAsset.shot.project.childrenClipStyleProfile;
    const masterAsset = shotAsset.shot.location?.masterBackgroundAsset;
    const masterLink = masterAsset?.childrenClipShotAsset;
    const masterMetadata = masterLink?.generationMetadata && typeof masterLink.generationMetadata === 'object' && !Array.isArray(masterLink.generationMetadata)
      ? masterLink.generationMetadata as Record<string, unknown> : {};
    const masterCompatible = Boolean(styleProfile && masterLink && ['ready_for_review', 'approved'].includes(masterLink.status) && (
      masterLink.origin === 'uploaded'
        ? masterLink.status === 'approved' && masterLink.approvedAt && masterLink.approvedAt >= styleProfile.lockedAt
        : masterMetadata.styleProfileVersion === styleProfile.versionNumber
    ));
    await this.prisma.$transaction([
      this.prisma.childrenClipShotAsset.update({
        where: { id: shotAssetId },
        data: { status: 'generating', bullJobId, seed, errorMessage: null, generationStartedAt: new Date(), generationEndedAt: null }
      }),
      this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'generating_assets' } })
    ]);
    try {
      const builtPrompt = this.shotPrompts.build({
        role: shotAsset.role,
        customPrompt: shotAsset.generationPrompt,
        shot: {
          ...shotAsset.shot,
          location: shotAsset.shot.location ? {
            ...shotAsset.shot.location,
            masterBackgroundAsset: masterCompatible && masterAsset ? { id: masterAsset.id, storagePath: masterAsset.storagePath } : null
          } : null
        },
        visualBible,
        styleProfile,
        narrative: shotAsset.shot.project.childrenClipPlan?.narrative,
        entities
      });
      const positivePrompt = builtPrompt.positivePrompt;
      const negativePrompt = [shotAsset.negativePrompt, builtPrompt.negativePrompt].filter(Boolean).join(', ');
      let backgroundReference = shotAsset.role === 'storyboard_frame'
        ? [...shotAsset.shot.assets]
          .filter((item) => item.role === 'background' && item.asset && ['ready_for_review', 'approved'].includes(item.status))
          .sort((left, right) => right.versionNumber - left.versionNumber)[0]?.asset ?? null
        : null;
      if (shotAsset.role === 'storyboard_frame' && !backgroundReference) {
        await this.assetProgress(job, 20, 'WAITING_BACKGROUND', 'Aguardando o background desta tomada ficar pronto antes de compor o storyboard.');
        const dependencyDeadline = Date.now() + 5 * 60_000;
        while (!backgroundReference && Date.now() < dependencyDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          const background = await this.prisma.childrenClipShotAsset.findFirst({
            where: { shotId: shotAsset.shotId, role: 'background', status: { in: ['ready_for_review', 'approved'] }, assetId: { not: null } },
            orderBy: { versionNumber: 'desc' }, include: { asset: true }
          });
          backgroundReference = background?.asset ?? null;
          if (!backgroundReference) await this.assetProgress(job, 20, 'WAITING_BACKGROUND', 'O background continua em processamento; o storyboard sera composto assim que ele terminar.');
        }
        if (!backgroundReference) throw new Error('O background da tomada nao ficou pronto dentro de 5 minutos');
      }
      const locationReference = shotAsset.role === 'background'
        ? builtPrompt.referenceAssets.find((item) => item.purpose === 'location-content') ?? null
        : null;
      const entityReferences = shotAsset.role === 'storyboard_frame'
        ? builtPrompt.referenceAssets.filter((item) => item.purpose === 'entity-content' && item.versionId)
        : [];
      const placements = this.characterPlacements(shotAsset.shot.characterPlacement);
      const regionalReferenceImages = entityReferences.map((reference, index) => {
        const placement = placements.find((item) => item.versionId === reference.versionId);
        const entity = entities.find((item) => item.versionId === reference.versionId)!;
        const fallbackX = entityReferences.length === 1 ? 50 : 20 + (60 * index) / Math.max(1, entityReferences.length - 1);
        const scale = placement?.scalePercent ?? 48;
        const isWideEntity = ['vehicle', 'train', 'car', 'bus'].includes(entity.type.toLowerCase());
        const isContactSheet = Boolean(reference.width && reference.height && reference.width / reference.height >= 1.35);
        const crop = isContactSheet && reference.width && reference.height
          ? isWideEntity
            ? { width: reference.width, height: Math.max(1, Math.round(reference.height * 0.34)), x: 0, y: 0 }
            : { width: Math.max(1, Math.round(reference.width * 0.25)), height: reference.height, x: 0, y: 0 }
          : undefined;
        const sourceAspect = crop
          ? crop.width / crop.height
          : reference.width && reference.height ? reference.width / reference.height : isWideEntity ? 2.8 : 0.5;
        const widthPercent = isWideEntity
          ? Math.max(34, Math.min(68, scale * 1.25))
          : Math.max(8, Math.min(32, (Math.max(28, Math.min(78, scale)) * dimensions.height * sourceAspect) / dimensions.width));
        const heightPercent = isWideEntity
          ? Math.max(16, Math.min(48, ((widthPercent * dimensions.width) / sourceAspect) / dimensions.height))
          : Math.max(28, Math.min(78, scale));
        const centerX = placement?.xPercent ?? fallbackX;
        const baselineY = placement?.yPercent ?? 76;
        return {
          path: this.storage.getAbsolutePath(reference.storagePath),
          prompt: [
            'polished original 2D children animation, exact same identity, colors, proportions, clothing and accessories as the reference image',
            `render exactly one ${entity.type} named ${entity.name}, isolated and centered on a pure white studio background`,
            entity.identity,
            shotAsset.shot.characterAction,
            placement ? `position ${placement.xPercent}% horizontal, feet or wheels grounded at ${placement.yPercent}% height` : null,
            'single subject, full body completely visible, clean silhouette with generous white margin, front or three-quarter view, no scenery, no props unless intrinsic to the identity, no other character, no duplicate, no text'
          ].filter(Boolean).join(', '),
          xPercent: Math.max(0, centerX - widthPercent / 2),
          yPercent: Math.max(0, baselineY - heightPercent),
          widthPercent,
          heightPercent,
          weight: 1,
          crop
        };
      });
      const contentReferenceAssetIds = [
        ...(backgroundReference ? [backgroundReference.id] : []),
        ...(locationReference ? [locationReference.id] : []),
        ...entityReferences.map((item) => item.id)
      ];

      await this.assetProgress(job, 8, 'STARTING', 'Worker iniciou a producao do asset da tomada.');
      await this.assetProgress(job, 18, 'LOADING_MODEL', `Carregando checkpoint ${checkpointName}.`);
      await this.assetProgress(job, 25, 'GENERATING', shotAsset.role === 'storyboard_frame'
        ? `Compondo a tomada com ${entityReferences.length} referencia(s) de personagem em ${dimensions.width}x${dimensions.height}.`
        : `Gerando ${shotAsset.role} em ${dimensions.width}x${dimensions.height}.`);
      const result = await this.comfyUi.generateStillImage({
        positivePrompt, negativePrompt, checkpointName, ...dimensions, steps, cfg, sampler, scheduler, seed,
        filenamePrefix: `children-clips/shot-${shotAsset.shot.index + 1}-${shotAsset.role}-v${shotAsset.versionNumber}`,
        loraName: loraName || null, loraStrength,
        referenceImagePath: backgroundReference
          ? this.storage.getAbsolutePath(backgroundReference.storagePath)
          : locationReference ? this.storage.getAbsolutePath(locationReference.storagePath) : null,
        regionalReferenceImages,
        denoise: backgroundReference ? 0.62 : locationReference ? 0.48 : undefined,
        onGpuWaiting: (owner) => this.assetProgress(
          job,
          22,
          'WAITING_GPU',
          `Asset aguardando a GPU local${owner ? `, atualmente ocupada por ${owner.split(':')[0]}` : ''}.`
        )
      });
      await this.assetProgress(job, 82, 'SAVING_ASSET', 'Imagem gerada. Salvando a versao para revisao.');
      const storagePath = this.storage.buildChildrenClipShotAssetPath(
        organizationId, projectId, shotAsset.shotId, shotAssetId, shotAsset.role
      );
      const absolutePath = await this.storage.ensureParentDirectory(storagePath);
      await writeFile(absolutePath, result.buffer);
      const sizeBytes = Number((await stat(absolutePath)).size);
      await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            organizationId, projectId, type: AssetType.image, mimeType: 'image/png', storagePath, sizeBytes,
            width: dimensions.width, height: dimensions.height,
            metadata: { source: 'comfyui', shotAssetId, shotId: shotAsset.shotId, role: shotAsset.role, promptId: result.promptId, checkpointName, seed, steps, cfg, sampler, scheduler, loraName: loraName || null, loraStrength, positivePrompt, negativePrompt, contentReferenceAssetIds, contentReferencePurpose: backgroundReference ? 'shot-background-and-entities' : locationReference?.purpose ?? null, styleReferenceAssetIds: builtPrompt.styleReferenceAssetIds, styleProfileVersion: builtPrompt.styleProfileVersion, allowedEntityVersionIds: builtPrompt.allowedEntityVersionIds, forbiddenEntityVersionIds: builtPrompt.forbiddenEntityVersionIds }
          }
        });
        await tx.childrenClipShotAsset.update({
          where: { id: shotAssetId },
          data: {
            assetId: asset.id, status: ChildrenClipShotAssetStatus.ready_for_review,
            generationEndedAt: new Date(), errorMessage: null,
            generationMetadata: { provider: result.provider, promptId: result.promptId, checkpointName, ...dimensions, seed, steps, cfg, sampler, scheduler, loraName: loraName || null, loraStrength, positivePrompt, negativePrompt, contentReferenceAssetIds, contentReferencePurpose: backgroundReference ? 'shot-background-and-entities' : locationReference?.purpose ?? null, styleReferenceAssetIds: builtPrompt.styleReferenceAssetIds, styleProfileVersion: builtPrompt.styleProfileVersion, allowedEntityVersionIds: builtPrompt.allowedEntityVersionIds, forbiddenEntityVersionIds: builtPrompt.forbiddenEntityVersionIds },
            reviewReason: null
          }
        });
        if (shotAsset.role === 'background' && shotAsset.shot.locationId) {
          await tx.childrenClipLocation.updateMany({
            where: { id: shotAsset.shot.locationId, masterBackgroundAssetId: null },
            data: { masterBackgroundAssetId: asset.id }
          });
        }
      });
      await this.assetProgress(job, 100, 'READY_FOR_REVIEW', 'Asset da tomada pronto para revisao.', ProcessingJobStatus.completed);
      this.logger.log(`Shot asset generated project=${projectId} shotAsset=${shotAssetId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await this.prisma.childrenClipShotAsset.update({
        where: { id: shotAssetId },
        data: { status: willRetry ? 'queued' : 'failed', errorMessage: message, generationEndedAt: willRetry ? null : new Date() }
      });
      await this.assetProgress(
        job, 0, willRetry ? 'RETRYING' : 'FAILED',
        willRetry ? `Tentativa falhou; o BullMQ tentara novamente: ${message}` : `Falha ao gerar asset: ${message}`,
        willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed, message
      );
      throw error;
    }
  }

  async processPlanGeneration(job: Job<ChildrenClipPlanGenerationJobPayload>) {
    const { projectId, organizationId, revisionInstruction, mode = 'full' } = job.data;
    const bullJobId = String(job.id);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null },
      include: {
        childrenClip: true,
        childrenClipAudioAnalysis: true,
        childrenClipPlan: true,
        childrenClipLocations: true,
        childrenClipShots: { orderBy: { index: 'asc' }, include: { assets: true } },
        musicSections: { orderBy: { startSeconds: 'asc' } },
        childrenClipLyricCues: { orderBy: { lineIndex: 'asc' } },
        characterLinks: {
          orderBy: { sortOrder: 'asc' },
          include: { character: true, selectedVersion: true }
        }
      }
    });
    if (!project?.childrenClip || project.childrenClipAudioAnalysis?.status !== 'completed') {
      throw new Error('A analise da musica precisa estar concluida antes do planejamento');
    }
    if (!project.characterLinks.length || project.characterLinks.some((link) => link.selectedVersion?.status !== 'approved')) {
      throw new Error('Todos os personagens precisam de uma versao aprovada');
    }
    await this.prisma.childrenClipPlan.update({
      where: { projectId },
      data: { status: 'generating', bullJobId, errorMessage: null, generationStartedAt: new Date(), generationEndedAt: null }
    });

    try {
      await this.planProgress(job, 5, 'STARTING', 'Worker iniciou o planejamento criativo.');
      await this.planProgress(job, 18, 'BUILDING_VISUAL_BIBLE', 'Definindo regras de arte, narrativa e seguranca infantil.');
      const characters = project.characterLinks.map((link) => ({
        name: link.character.name,
        roleName: link.roleName,
        versionId: link.selectedVersion!.id,
        description: link.selectedVersion!.description
      }));
      const beatGrid = this.numberArray(project.childrenClipAudioAnalysis.beatGrid);
      const skeletons = project.childrenClipShots.length
        ? project.childrenClipShots.map((shot) => ({
          index: shot.index,
          localIndex: project.childrenClipShots.filter((candidate) => candidate.musicSectionId === shot.musicSectionId && candidate.index < shot.index).length,
          sectionId: shot.musicSectionId ?? project.musicSections[0]?.id ?? '',
          sectionTitle: project.musicSections.find((section) => section.id === shot.musicSectionId)?.title ?? 'Secao',
          sectionType: project.musicSections.find((section) => section.id === shot.musicSectionId)?.type ?? 'instrumental',
          startSeconds: shot.startSeconds,
          endSeconds: shot.endSeconds,
          lyricText: shot.lyricText
        }))
        : this.planning.buildSkeletons({
          durationSeconds: project.childrenClipAudioAnalysis.durationSeconds!, beatGrid,
          sections: project.musicSections, cues: project.childrenClipLyricCues
        });
      const draftSignature = JSON.stringify({
        mode,
        revisionInstruction: revisionInstruction || null,
        planVersion: project.childrenClipPlan?.versionNumber ?? 0,
        shots: skeletons.map((shot) => [shot.index, shot.sectionId, shot.startSeconds, shot.endSeconds, shot.lyricText])
      });
      const jobDataWithDraft = job.data as ChildrenClipPlanGenerationJobPayload & { shotPlanningDraft?: ShotPlanningDraft };
      const savedDraft = jobDataWithDraft.shotPlanningDraft;
      const planningDraft: ShotPlanningDraft = savedDraft?.version === 2 && savedDraft.signature === draftSignature
        ? savedDraft
        : { version: 2, signature: draftSignature, batches: [] };
      const persistDraft = async () => job.updateData({ ...job.data, shotPlanningDraft: planningDraft } as ChildrenClipPlanGenerationJobPayload);
      let globalCreative: CreativePlanResponse | null = planningDraft.globalCreative ?? null;
      if (mode === 'full' && !project.childrenClipPlan?.visualBible && !globalCreative) {
        globalCreative = await this.withPlanHeartbeat(job, this.ollama.generateJson<CreativePlanResponse>([
          {
            role: 'system',
            content: 'Return concise JSON with visualBible and narrative for an original safe 2D children music video. visualBible must include style, palette, lighting, backgroundStyle, continuityRules and characterRules with exact name, type and identity. narrative must include summary, characterIntroductionOrder as an array of exact entity names, entityIntroductions as an array of { entityName, firstShotIndex }, storyBeats as an array of { section, focus, purpose, visualGuidance }, and continuityRules. Every firstShotIndex must reflect the lyrics and story beats. Do not create shotPlans yet.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: project.title,
              concept: this.limitText(project.childrenClip.concept, 1800),
              visualStyle: this.limitText(project.childrenClip.visualStyle, 800),
              audience: [project.childrenClip.audienceAgeMin, project.childrenClip.audienceAgeMax],
              sections: project.musicSections.map((section) => ({ title: section.title, type: section.type, lyrics: this.limitText(section.lyricsExcerpt, 300) })),
              entities: characters.map((character) => ({ name: character.name, role: character.roleName, description: this.limitText(character.description, 300) })),
              revisionInstruction: revisionInstruction || null
            })
          }
        ]), 18, 30, 'O Ollama esta estruturando a Biblia Visual e a Narrativa.');
        if (globalCreative) {
          planningDraft.globalCreative = globalCreative;
          await persistDraft();
        }
      }
      const baseVisualBible = globalCreative?.visualBible ?? project.childrenClipPlan?.visualBible ?? null;
      const baseNarrative = globalCreative?.narrative ?? project.childrenClipPlan?.narrative ?? null;
      const batches = this.shotPlanningBatches(skeletons, 6);
      const generatedLocations = new Map<string, NonNullable<CreativePlanResponse['locations']>[number]>();
      const generatedShotPlans: NonNullable<CreativePlanResponse['shotPlans']> = [];
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        const startProgress = 20 + Math.floor((batchIndex / Math.max(1, batches.length)) * 22);
        const nextBatchProgress = 20 + Math.floor(((batchIndex + 1) / Math.max(1, batches.length)) * 22);
        const cachedBatch = planningDraft.batches.find((item) => item.batchIndex === batchIndex);
        if (cachedBatch) {
          await this.planProgress(job, startProgress, 'REUSING_SHOT_BATCH', `Reutilizando tomadas ${batch[0].index + 1} a ${batch[batch.length - 1].index + 1} do checkpoint (${batchIndex + 1}/${batches.length}).`);
          for (const location of cachedBatch.response.locations ?? []) {
            const key = location.key?.trim().toLowerCase();
            if (key) generatedLocations.set(key, location);
          }
          if (Array.isArray(cachedBatch.response.shotPlans)) generatedShotPlans.push(...cachedBatch.response.shotPlans);
          continue;
        }
        await this.planProgress(job, startProgress, 'PLANNING_SHOT_BATCH', `Planejando tomadas ${batch[0].index + 1} a ${batch[batch.length - 1].index + 1} (${batchIndex + 1}/${batches.length}).`);
        const response = await this.withPlanHeartbeat(job, this.ollama.generateJson<CreativePlanResponse>([
          {
            role: 'system',
            content: [
              'Return concise JSON only with locations and shotPlans.',
              'Create exactly one shotPlan for each supplied shotIndex.',
              'Every shotPlan must use: shotIndex, purpose, locationKey, locationName, locationDescription, timeOfDay, primaryFocus, allowedEntities, forbiddenEntities, objects, action, composition, camera, emotion, motionIntent, continuityFromPreviousShot, characterPlacement, backgroundSafeZones, grounding.',
              'characterPlacement assigns each allowed entity to a 0-100 percent x/y zone and scale. backgroundSafeZones reserve clean space. grounding defines groundLinePercent, horizonPercent, perspective and movementDirection.',
              'Use exact entity names. Respect introduction order. A future entity must be forbidden, never allowed.',
              'Each action and composition must visualize only that shot lyrics and differ from adjacent shots.',
              'Reuse a locationKey when the place is unchanged. Location descriptions contain environment only, never entities.',
              'Do not repeat global summary. Keep values short. Vehicle/object entities are not humans or animals.'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: project.title,
              visualContext: this.compactVisualContext(baseVisualBible, project.childrenClip.visualStyle, characters),
              narrativeContext: this.compactNarrativeContext(baseNarrative, batch.map((item) => item.sectionTitle)),
              shots: batch,
              revisionInstruction: revisionInstruction || null
            })
          }
        ]), startProgress, Math.max(startProgress, nextBatchProgress - 1), `O Ollama continua planejando o lote ${batchIndex + 1}/${batches.length}.`);
        for (const location of response?.locations ?? []) {
          const key = location.key?.trim().toLowerCase();
          if (key) generatedLocations.set(key, location);
        }
        if (Array.isArray(response?.shotPlans)) generatedShotPlans.push(...response.shotPlans);
        if (response) {
          planningDraft.batches.push({ batchIndex, response });
          await persistDraft();
        }
      }
      for (const savedRepair of planningDraft.repairs ?? []) {
        const repair = this.normalizeCreativePlanResponse(savedRepair);
        for (const location of repair.locations ?? []) {
          const key = location.key?.trim().toLowerCase();
          if (key) generatedLocations.set(key, location);
        }
        if (Array.isArray(repair.shotPlans)) generatedShotPlans.push(...repair.shotPlans);
      }
      for (let repairAttempt = 0; repairAttempt < 2; repairAttempt += 1) {
        const plannedIndexes = new Set(generatedShotPlans.map((shot) => shot.shotIndex).filter((index): index is number => typeof index === 'number'));
        const missingShots = skeletons.filter((shot) => !plannedIndexes.has(shot.index));
        if (!missingShots.length) break;
        await this.planProgress(job, 43 + repairAttempt, 'REPAIRING_SHOT_PLAN', `Completando ${missingShots.length} tomada(s) omitida(s) pelo modelo: ${missingShots.map((shot) => shot.index + 1).join(', ')}.`);
        const rawRepair = await this.withPlanHeartbeat(job, this.ollama.generateJson<CreativePlanResponse>([
          {
            role: 'system',
            content: [
              'Return concise JSON only with locations and shotPlans.',
              'Create exactly one complete shotPlan for every supplied shotIndex; do not return any other index.',
              'Every shotPlan must use: shotIndex, purpose, locationKey, locationName, locationDescription, timeOfDay, primaryFocus, allowedEntities, forbiddenEntities, objects, action, composition, camera, emotion, motionIntent, continuityFromPreviousShot, characterPlacement, backgroundSafeZones, grounding.',
              'Use exact entity names, respect introduction order, describe only the synchronized lyric moment, and keep location fields environment-only.'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: project.title,
              visualContext: this.compactVisualContext(baseVisualBible, project.childrenClip.visualStyle, characters),
              narrativeContext: this.compactNarrativeContext(baseNarrative, missingShots.map((item) => item.sectionTitle)),
              missingShots,
              adjacentShotPlans: generatedShotPlans.filter((plan) => typeof plan.shotIndex === 'number' && missingShots.some((shot) => Math.abs(shot.index - plan.shotIndex!) === 1)),
              revisionInstruction: revisionInstruction || null
            })
          }
        ]), 43 + repairAttempt, 44 + repairAttempt, `O Ollama esta completando tomadas omitidas (tentativa ${repairAttempt + 1}/2).`);
        if (!rawRepair) continue;
        const repair = this.normalizeCreativePlanResponse(rawRepair);
        planningDraft.repairs = [...(planningDraft.repairs ?? []), repair];
        await persistDraft();
        for (const location of repair.locations ?? []) {
          const key = location.key?.trim().toLowerCase();
          if (key) generatedLocations.set(key, location);
        }
        if (Array.isArray(repair.shotPlans)) generatedShotPlans.push(...repair.shotPlans);
      }
      const auditedShotPlans: NonNullable<CreativePlanResponse['shotPlans']> = [];
      const entityIntroductionSchedule = this.planning.entityIntroductionSchedule(skeletons, characters, baseVisualBible, baseNarrative);
      const auditBatches = skeletons.map((shot) => [shot]);
      for (let batchIndex = 0; batchIndex < auditBatches.length; batchIndex += 1) {
        const batch = auditBatches[batchIndex];
        const indexes = new Set(batch.map((shot) => shot.index));
        const sourcePlans = batch.flatMap((shot) => {
          const plan = [...generatedShotPlans].reverse().find((candidate) => candidate.shotIndex === shot.index);
          return plan ? [plan] : [];
        });
        const previousAuditedShotPlans = auditedShotPlans.slice(-2);
        const nextSourceShotPlans = generatedShotPlans
          .filter((plan) => typeof plan.shotIndex === 'number' && plan.shotIndex > batch[0].index)
          .sort((left, right) => left.shotIndex! - right.shotIndex!)
          .slice(0, 2);
        if (sourcePlans.length !== batch.length) throw new Error(`Auditoria bloqueada: faltam tomadas no lote ${batchIndex + 1}`);
        const cachedAudit = planningDraft.audits?.find((item) => item.batchIndex === batchIndex)?.response;
        const auditProgress = 48 + Math.floor((batchIndex / Math.max(1, auditBatches.length)) * 18);
        let audit = cachedAudit ? this.normalizeCreativePlanResponse(cachedAudit) : null;
        if (!audit) {
          await this.planProgress(job, auditProgress, 'AUDITING_SHOT', `Segunda IA revisando a tomada ${batch[0].index + 1} (${batchIndex + 1}/${auditBatches.length}).`);
          const rawAudit = await this.withPlanHeartbeat(job, this.ollama.generateJson<CreativePlanResponse>([
            {
              role: 'system',
              content: [
                'You are the mandatory second-pass continuity and semantic auditor for a children music video Shot Plan.',
                'Return concise JSON only with shotPlans. Return exactly one corrected complete shotPlan for every supplied shotIndex and no other index.',
                'Do not merely comment on problems: rewrite each shotPlan so it is internally consistent.',
                'Use exact approved entity names only. allowedEntities and forbiddenEntities must be disjoint.',
                'primaryFocus must be present in allowedEntities when it names an approved entity.',
                'Every approved entity described as visible, acting, framed, followed by the camera, positioned or focused must be in allowedEntities.',
                'No entity in forbiddenEntities may be described as visible or acting in action, composition, camera, purpose, motionIntent, continuity or characterPlacement.',
                'Prose fields must describe only what is visibly happening. Never insert labels or lists such as Focus, Allowed entities, Forbidden entities, Entities present or Do not appear into prose fields.',
                'Respect characterIntroductionOrder and the synchronized lyric moment. Do not introduce future entities early.',
                'Treat the nearby shot plans as mandatory continuity context. The current action and purpose must visibly advance the story from the previous audited shot and prepare the next planned shot.',
                'Write one concrete, filmable action tied to the supplied synchronized lyrics. Avoid generic filler such as merely moving smoothly, playing, dancing or continuing the prior action without a new visible beat.',
                'Never repeat the previous action verbatim. When lyrics or a chorus repeat, vary the gesture, staging, interaction, composition or camera while preserving the musical motif.',
                'continuityFromPreviousShot must state what spatial or visual element is preserved and what changes in this shot.',
                'Location name and description contain environment only. Preserve valid creative intent, timing and location continuity.',
                'Every shotPlan must include: shotIndex, purpose, locationKey, locationName, locationDescription, timeOfDay, primaryFocus, allowedEntities, forbiddenEntities, objects, action, composition, camera, emotion, motionIntent, continuityFromPreviousShot, characterPlacement, backgroundSafeZones, grounding.'
              ].join(' ')
            },
            {
              role: 'user',
              content: JSON.stringify({
                title: project.title,
                approvedEntities: characters.map((character) => ({ name: character.name, role: character.roleName, description: this.limitText(character.description, 220) })),
                narrativeContext: this.compactNarrativeContext(baseNarrative, batch.map((item) => item.sectionTitle)),
                shots: batch,
                shotPlansToAudit: sourcePlans,
                previousAuditedShotPlans,
                nextPlannedShotPlans: nextSourceShotPlans,
                eligibleEntityNames: entityIntroductionSchedule.filter((entity) => entity.firstShotIndex <= batch[0].index).map((entity) => entity.name),
                futureEntityNames: entityIntroductionSchedule.filter((entity) => entity.firstShotIndex > batch[0].index).map((entity) => entity.name),
                revisionInstruction: revisionInstruction || null
              })
            }
          ]), auditProgress, Math.min(67, auditProgress + 1), `A segunda IA continua auditando a tomada ${batch[0].index + 1} (${batchIndex + 1}/${auditBatches.length}).`);
          if (!rawAudit) throw new Error(`A segunda IA nao retornou uma auditoria para o lote ${batchIndex + 1}`);
          audit = this.normalizeCreativePlanResponse(rawAudit);
        } else {
          await this.planProgress(job, auditProgress, 'REUSING_SHOT_AUDIT', `Reutilizando auditoria da tomada ${batch[0].index + 1}.`);
        }
        let audited = (audit.shotPlans ?? []).filter((plan) => typeof plan.shotIndex === 'number' && indexes.has(plan.shotIndex));
        const auditedIndexes = new Set(audited.map((plan) => plan.shotIndex));
        if (audited.length !== batch.length || auditedIndexes.size !== batch.length || (audit.shotPlans ?? []).some((plan) => typeof plan.shotIndex !== 'number' || !indexes.has(plan.shotIndex))) {
          throw new Error(`A segunda IA retornou uma auditoria incompleta ou com indices invalidos no lote ${batchIndex + 1}`);
        }
        let reconciled = audited.map((plan) => this.planning.reconcileAuditedShotPlan(plan, characters));
        for (let repairAttempt = 0; repairAttempt < 3; repairAttempt += 1) {
          const rejected = reconciled[0];
          const rejectionReason = this.shotAuditIssue(rejected, auditedShotPlans, entityIntroductionSchedule, batch[0].index);
          if (!rejectionReason) break;
          const conflicting = auditedShotPlans.filter((previous) => this.normalizeShotText(previous.action) === this.normalizeShotText(rejected.action));
          await this.planProgress(job, auditProgress, 'REPAIRING_SHOT_CONTINUITY', `Corrigindo a tomada ${batch[0].index + 1}: ${rejectionReason} (tentativa ${repairAttempt + 1}/3).`);
          const rawRepair = await this.withPlanHeartbeat(job, this.ollama.generateJson<CreativePlanResponse>([
            {
              role: 'system',
              content: [
                'You are repairing one rejected children music video shot plan. Return concise JSON only with shotPlans and exactly one complete shotPlan for the supplied shotIndex.',
                'Preserve valid entity constraints, location continuity and approved identities, but rewrite the action, purpose, composition, camera, motionIntent and continuityFromPreviousShot as needed.',
                'The action must be a new concrete filmable event tied to the synchronized lyric. It must differ semantically and verbatim from every prior action supplied.',
                'Changing only adjectives, punctuation or word order is not sufficient. Change the visible beat through a distinct gesture, interaction, prop, staging or reaction.',
                'No forbidden entity may appear in any positive prose or placement field. Return all fields from the rejected shot plan.'
              ].join(' ')
            },
            {
              role: 'user',
              content: JSON.stringify({
                title: project.title,
                shot: batch[0],
                rejectionReason,
                rejectedShotPlan: rejected,
                conflictingPriorShotPlans: conflicting,
                allPriorActions: auditedShotPlans.map((plan) => ({ shotIndex: plan.shotIndex, action: plan.action })),
                nextPlannedShotPlans: nextSourceShotPlans,
                approvedEntityNames: characters.map((character) => character.name),
                eligibleEntityNames: entityIntroductionSchedule.filter((entity) => entity.firstShotIndex <= batch[0].index).map((entity) => entity.name),
                futureEntityNames: entityIntroductionSchedule.filter((entity) => entity.firstShotIndex > batch[0].index).map((entity) => entity.name),
                revisionInstruction: revisionInstruction || null
              })
            }
          ]), auditProgress, Math.min(67, auditProgress + 1), `O Ollama esta corrigindo a continuidade da tomada ${batch[0].index + 1}.`);
          if (!rawRepair) continue;
          const normalizedRepair = this.normalizeCreativePlanResponse(rawRepair);
          const repairPlans = (normalizedRepair.shotPlans ?? []).filter((plan) => plan.shotIndex === batch[0].index);
          if (repairPlans.length !== 1 || (normalizedRepair.shotPlans ?? []).length !== 1) continue;
          audited = repairPlans;
          reconciled = repairPlans.map((plan) => this.planning.reconcileAuditedShotPlan(plan, characters));
        }
        const remainingIssue = this.shotAuditIssue(reconciled[0], auditedShotPlans, entityIntroductionSchedule, batch[0].index);
        if (remainingIssue) throw new Error(`A segunda IA nao conseguiu corrigir a tomada ${batch[0].index + 1} apos 3 reparos direcionados: ${remainingIssue}`);
        audit = { shotPlans: reconciled };
        planningDraft.audits = [...(planningDraft.audits ?? []).filter((item) => item.batchIndex !== batchIndex), { batchIndex, response: audit }];
        await persistDraft();
        auditedShotPlans.push(...reconciled);
      }
      const creative: CreativePlanResponse | null = globalCreative || auditedShotPlans.length || generatedLocations.size
        ? { ...globalCreative, locations: [...generatedLocations.values()], shotPlans: auditedShotPlans }
        : null;
      await this.planProgress(job, 68, 'SHOT_AUDIT_COMPLETED', `${auditedShotPlans.length} tomadas passaram pela segunda rodada de IA.`);
      await this.planProgress(job, 70, 'PLANNING_SECTIONS', `Direcao narrativa definida para ${project.musicSections.length} secoes.`);
      const planningCreative = creative && mode === 'shots_only' ? { ...creative, visualBible: undefined, narrative: undefined } : creative;
      const result = this.planning.build({
        title: project.title,
        concept: project.childrenClip.concept,
        visualStyle: project.childrenClip.visualStyle,
        audienceAgeMin: project.childrenClip.audienceAgeMin,
        audienceAgeMax: project.childrenClip.audienceAgeMax,
        durationSeconds: project.childrenClipAudioAnalysis.durationSeconds!,
        beatGrid,
        sections: project.musicSections,
        cues: project.childrenClipLyricCues,
        characters,
        creative: planningCreative,
        existingVisualBible: baseVisualBible,
        existingNarrative: baseNarrative,
        existingShots: project.childrenClipShots.length ? project.childrenClipShots.map((shot) => ({
          index: shot.index, startSeconds: shot.startSeconds, endSeconds: shot.endSeconds,
          musicSectionId: shot.musicSectionId ?? project.musicSections[0]?.id ?? '', lyricText: shot.lyricText
        })) : undefined
      });
      await this.planProgress(job, 74, 'BUILDING_TIMELINE', `Montando ${result.shots.length} tomadas na grade musical.`);
      this.validateTimeline(result.shots, project.childrenClipAudioAnalysis.durationSeconds!);
      await this.planProgress(job, 88, 'VALIDATING', 'Validando cobertura, continuidade e identidades aprovadas.');

      await this.prisma.$transaction(async (tx) => {
        const locationIds = new Map<string, string>();
        for (const location of result.locations) {
          const persisted = await tx.childrenClipLocation.upsert({
            where: { projectId_key: { projectId, key: location.key } },
            create: { projectId, key: location.key, name: location.name, description: location.description, timeOfDay: location.timeOfDay, visualPrompt: location.visualPrompt, continuityRules: location.continuityRules },
            update: { name: location.name, description: location.description, timeOfDay: location.timeOfDay, visualPrompt: location.visualPrompt, continuityRules: location.continuityRules }
          });
          locationIds.set(location.key, persisted.id);
        }
        const shotData = (shot: typeof result.shots[number]) => ({
            projectId,
            musicSectionId: shot.musicSectionId,
            locationId: locationIds.get(shot.locationKey),
            index: shot.index,
            title: shot.title,
            description: shot.description,
            purpose: shot.purpose,
            primaryFocus: shot.primaryFocus,
            timeOfDay: shot.timeOfDay,
            emotion: shot.emotion,
            motionIntent: shot.motionIntent,
            continuityFromPreviousShot: shot.continuityFromPreviousShot,
            startSeconds: shot.startSeconds,
            endSeconds: shot.endSeconds,
            durationSeconds: shot.durationSeconds,
            framing: shot.framing,
            cameraMovement: shot.cameraMovement,
            characterAction: shot.characterAction,
            environment: shot.environment,
            backgroundPrompt: shot.backgroundPrompt,
            transitionIn: shot.transitionIn,
            transitionOut: shot.transitionOut,
            lyricText: shot.lyricText,
            characterVersionIds: shot.characterVersionIds,
            forbiddenEntityVersionIds: shot.forbiddenEntityVersionIds,
            objects: shot.objects,
            layers: shot.layers as Prisma.InputJsonValue,
            characterPlacement: shot.characterPlacement as Prisma.InputJsonValue,
            backgroundSafeZones: shot.backgroundSafeZones as Prisma.InputJsonValue,
            groundingRules: shot.groundingRules as Prisma.InputJsonValue,
            motionPreset: shot.motionPreset,
            status: 'needs_revision' as const
        });
        if (project.childrenClipShots.length) {
          for (const shot of result.shots) {
            const current = project.childrenClipShots.find((item) => item.index === shot.index);
            if (!current) continue;
            const backgroundChanged = current.backgroundPrompt.trim() !== shot.backgroundPrompt.trim();
            await tx.childrenClipShot.update({ where: { id: current.id }, data: shotData(shot) });
            if (backgroundChanged) {
              await tx.childrenClipShotAsset.updateMany({
                where: { shotId: current.id, role: 'background', status: { in: ['approved', 'ready_for_review'] } },
                data: { status: 'ready_for_review', approvedAt: null, reviewReason: 'A especificacao visual da tomada mudou no replanejamento. Revise este asset antes de reutiliza-lo.' }
              });
            }
          }
        } else {
          await tx.childrenClipShot.createMany({ data: result.shots.map(shotData) });
        }
        await tx.childrenClipLocation.deleteMany({ where: { projectId, shots: { none: {} } } });
        await tx.childrenClipPlan.update({
          where: { projectId },
          data: {
            status: 'ready_for_review',
            versionNumber: project.childrenClipPlan?.visualBible ? { increment: 1 } : 1,
            visualBible: result.visualBible as Prisma.InputJsonValue,
            narrative: result.narrative as Prisma.InputJsonValue,
            generationMetadata: {
              provider: creative ? 'ollama-shot-plans+ollama-audit+deterministic-validation' : 'deterministic-shot-fallback',
              mode,
              shotCount: result.shots.length,
              ollamaBatchCount: batches.length,
              ollamaAuditCallCount: auditBatches.length,
              ollamaShotPlanCount: new Set(generatedShotPlans.map((shot) => shot.shotIndex).filter((index): index is number => typeof index === 'number')).size,
              ollamaAuditedShotCount: new Set(auditedShotPlans.map((shot) => shot.shotIndex).filter((index): index is number => typeof index === 'number')).size,
              deterministicFallbackShotCount: result.shots.length - new Set(generatedShotPlans.map((shot) => shot.shotIndex).filter((index): index is number => typeof index === 'number')).size,
              characterVersionIds: project.characterLinks.map((link) => link.selectedVersion!.id),
              generatedAt: new Date().toISOString()
            },
            revisionInstruction: revisionInstruction || null,
            generationEndedAt: new Date(),
            errorMessage: null,
            approvedAt: null
          }
        });
        await tx.childrenClip.update({ where: { projectId }, data: { productionStatus: 'storyboarding' } });
      });
      await this.planProgress(job, 100, 'READY_FOR_REVIEW', 'Biblia visual, roteiro e storyboard prontos para revisao.', ProcessingJobStatus.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      if (willRetry && (/Shot Plan invalido|segunda IA|Auditoria bloqueada/i.test(message))) {
        const currentData = job.data as ChildrenClipPlanGenerationJobPayload & { shotPlanningDraft?: ShotPlanningDraft };
        if (currentData.shotPlanningDraft) {
          await job.updateData({ ...currentData, shotPlanningDraft: { ...currentData.shotPlanningDraft, audits: [] } } as ChildrenClipPlanGenerationJobPayload);
        }
      }
      await this.prisma.childrenClipPlan.update({
        where: { projectId },
        data: { status: willRetry ? 'queued' : 'failed', errorMessage: message, generationEndedAt: willRetry ? null : new Date() }
      });
      await this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: willRetry ? 'planning_narrative' : 'failed' } });
      await this.planProgress(
        job, 0, willRetry ? 'RETRYING' : 'FAILED',
        willRetry ? `Tentativa falhou; o BullMQ tentara novamente: ${message}` : `Falha no planejamento: ${message}`,
        willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed, message
      );
      throw error;
    }
  }

  async processAudioAnalysis(job: Job<ChildrenClipAudioAnalysisJobPayload>) {
    const { projectId, organizationId } = job.data;
    const bullJobId = String(job.id);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null },
      include: { track: true, lyrics: true, childrenClip: true }
    });
    if (!project?.track || !project.childrenClip) throw new Error(`Children clip ${projectId} has no audio track`);

    await this.prisma.childrenClipAudioAnalysis.upsert({
      where: { projectId },
      create: { projectId, status: 'analyzing', bullJobId, analysisStartedAt: new Date() },
      update: {
        status: 'analyzing', bullJobId, errorMessage: null,
        analysisStartedAt: new Date(), analysisCompletedAt: null
      }
    });

    try {
      await this.audioProgress(job, 5, 'STARTING', 'Worker iniciou a analise da musica.');
      await this.audioProgress(job, 12, 'PROBING_AUDIO', 'Validando codec, duracao e metadados com FFprobe.');
      await this.audioProgress(job, 22, 'DECODING_AUDIO', 'Decodificando o sinal para analise ritmica com FFmpeg.');
      const result = await this.audioAnalysis.analyze(project.track.storagePath);
      await this.audioProgress(job, 58, 'DETECTING_BEATS', `Grade ritmica detectada em ${result.bpm.toFixed(1)} BPM.`);

      const plannedSections = this.musicStructure.build(
        result.durationSeconds,
        project.lyrics?.rawText ?? '',
        project.lyrics?.normalizedText ?? ''
      );
      const sections = this.refineSectionBoundaries(
        plannedSections,
        result.energyCurve,
        result.beats,
        result.durationSeconds
      ).map((section) => ({
        ...section,
        energy: this.averageEnergy(result.energyCurve, section.startSeconds, section.endSeconds)
      }));
      const cues = this.lyricsAlignment.align(
        project.lyrics?.rawText ?? '', result.durationSeconds, result.beats
      );
      await this.audioProgress(job, 76, 'ALIGNING_LYRICS', `Alinhando ${cues.length} linhas da letra a grade musical.`);

      await this.prisma.$transaction(async (tx) => {
        await tx.musicSection.deleteMany({ where: { projectId } });
        await tx.childrenClipLyricCue.deleteMany({ where: { projectId } });
        if (sections.length) {
          await tx.musicSection.createMany({
            data: sections.map((section) => ({ projectId, ...section }))
          });
        }
        if (cues.length) {
          await tx.childrenClipLyricCue.createMany({
            data: cues.map((cue) => ({
              projectId,
              lineIndex: cue.lineIndex,
              text: cue.text,
              startSeconds: cue.startSeconds,
              endSeconds: cue.endSeconds,
              confidence: cue.confidence,
              words: cue.words as Prisma.InputJsonValue
            }))
          });
        }
        await tx.track.update({ where: { projectId }, data: { durationSeconds: result.durationSeconds } });
        await tx.project.update({
          where: { id: projectId },
          data: { clipDurationSeconds: result.durationSeconds, status: 'uploaded', errorMessage: null }
        });
        await tx.childrenClipAudioAnalysis.update({
          where: { projectId },
          data: {
            status: 'completed',
            durationSeconds: result.durationSeconds,
            sampleRate: result.sampleRate,
            channels: result.channels,
            bitrate: result.bitrate,
            bpm: result.bpm,
            beatConfidence: result.beatConfidence,
            timeSignature: result.timeSignature,
            loudnessDb: result.loudnessDb,
            peakDb: result.peakDb,
            beatGrid: result.beats,
            energyCurve: result.energyCurve as unknown as Prisma.InputJsonValue,
            waveform: result.waveform as unknown as Prisma.InputJsonValue,
            errorMessage: null,
            analysisCompletedAt: new Date()
          }
        });
        await tx.childrenClip.update({
          where: { projectId },
          data: { productionStatus: 'designing_characters' }
        });
      });
      await this.audioProgress(job, 92, 'PERSISTING_TIMELINE', `${sections.length} secoes e ${cues.length} cues persistidos.`);
      await this.audioProgress(job, 100, 'COMPLETED', 'Analise da musica concluida.', ProcessingJobStatus.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await this.prisma.childrenClipAudioAnalysis.upsert({
        where: { projectId },
        create: { projectId, status: willRetry ? 'queued' : 'failed', bullJobId, errorMessage: message, analysisCompletedAt: willRetry ? null : new Date() },
        update: { status: willRetry ? 'queued' : 'failed', errorMessage: message, analysisCompletedAt: willRetry ? null : new Date() }
      });
      await this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: willRetry ? 'analyzing_audio' : 'failed' } });
      await this.audioProgress(
        job,
        0,
        willRetry ? 'RETRYING' : 'FAILED',
        willRetry ? `Tentativa falhou; o BullMQ tentara novamente: ${message}` : `Falha ao analisar musica: ${message}`,
        willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed,
        message
      );
      throw error;
    }
  }

  async processCharacterGeneration(job: Job<ChildrenClipCharacterGenerationJobPayload>) {
    if (job.data.characterAssetId) return this.processSupplementaryCharacterAsset(job);
    const { projectId, organizationId, characterId, characterVersionId } = job.data;
    const bullJobId = String(job.id);
    const version = await this.prisma.characterVersion.findFirst({
      where: {
        id: characterVersionId,
        characterId,
        character: {
          organizationId,
          projectLinks: { some: { projectId } }
        }
      },
      include: { character: true }
    });
    if (!version?.generationPrompt) {
      throw new Error(`Character version ${characterVersionId} is not ready for generation`);
    }
    const styleLock = await this.prisma.childrenClipStyleProfile.findUnique({ where: { projectId } });
    if (styleLock?.status === 'stale') throw new Error(styleLock.staleReason || 'O Project Style Lock esta desatualizado');
    const lockedStyle = this.styleLockPrompt(styleLock);

    const seed = version.seed ?? Math.floor(Math.random() * 2_147_483_646);
    const checkpointName = this.config.get<string>('visual.characterCheckpointName', '').trim();
    const width = this.config.get<number>('visual.characterWidth', 1024);
    const height = this.config.get<number>('visual.characterHeight', 1024);
    const steps = this.config.get<number>('visual.characterSteps', 30);
    const cfg = this.config.get<number>('visual.characterCfg', 6.5);
    const sampler = this.config.get<string>('visual.characterSampler', 'dpmpp_2m');
    const scheduler = this.config.get<string>('visual.characterScheduler', 'karras');
    const loraName = this.config.get<string>('visual.characterLoraName', '').trim();
    const loraStrength = this.config.get<number>('visual.characterLoraStrength', 1);

    await this.prisma.characterVersion.update({
      where: { id: characterVersionId },
      data: {
        status: CharacterVersionStatus.generating,
        bullJobId,
        seed,
        errorMessage: null,
        generationStartedAt: new Date(),
        generationCompletedAt: null
      }
    });
    await this.characterProgress(job, 10, 'STARTING', 'Worker iniciou a geracao da ficha do personagem.');

    try {
      await this.characterProgress(job, 15, 'OPTIMIZING_PROMPT', 'Traduzindo e estruturando a descricao visual.');
      const optimizedPrompt = await this.ollama.generateJson<OptimizedCharacterPrompt>([
        {
          role: 'system',
          content:
            'You convert Portuguese or English character descriptions into precise English SDXL prompts. ' +
            'Preserve every physical trait, species, outfit, accessory and color. Never invent a human when the source describes an animal. ' +
            'Return JSON with positivePrompt and negativePrompt only. The positive prompt must describe one original 2D children animation character turnaround sheet with front, side and back views and consistent identity.'
        },
        {
          role: 'user',
          content: version.generationPrompt
        }
      ]);
      const positivePrompt = [
        lockedStyle.positive,
        'flat 2D vector cartoon, simple cel shading, clean bold outlines, colorful original children animation design',
        optimizedPrompt?.positivePrompt?.trim() || version.generationPrompt
      ].join(', ');
      const safetyNegativePrompt =
        'photorealistic, realistic skin, 3d render, realistic fur, realistic feathers, text, letters, logo, watermark, signature, human when animal is requested, multiple different characters, inconsistent outfit, cropped body, extra arms, extra legs, malformed hands, duplicate body';
      const negativePrompt = [...lockedStyle.negative, optimizedPrompt?.negativePrompt?.trim(), safetyNegativePrompt]
        .filter(Boolean)
        .join(', ');
      await this.characterProgress(job, 20, 'LOADING_MODEL', `Carregando checkpoint ${checkpointName}.`);
      const result = await this.comfyUi.generateStillImage({
        positivePrompt,
        negativePrompt,
        checkpointName,
        width,
        height,
        steps,
        cfg,
        sampler,
        scheduler,
        seed,
        filenamePrefix: `children-clips/character-${characterId}-v${version.versionNumber}`,
        loraName: loraName || null,
        loraStrength,
        onGpuWaiting: (owner) => this.characterProgress(
          job,
          22,
          'WAITING_GPU',
          `Personagem aguardando a GPU local${owner ? `, atualmente ocupada por ${owner.split(':')[0]}` : ''}.`
        )
      });
      await this.characterProgress(job, 75, 'SAVING_ASSET', 'Imagem gerada. Salvando ficha versionada.');

      const storagePath = this.storage.buildCharacterAssetPath(
        organizationId,
        projectId,
        characterId,
        version.versionNumber
      );
      const absolutePath = await this.storage.ensureParentDirectory(storagePath);
      await writeFile(absolutePath, result.buffer);
      const sizeBytes = Number((await stat(absolutePath)).size);

      await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            organizationId,
            projectId,
            type: AssetType.image,
            mimeType: 'image/png',
            storagePath,
            sizeBytes,
            width,
            height,
            metadata: {
              source: 'comfyui',
              characterId,
              characterVersionId,
              promptId: result.promptId,
              checkpointName,
              seed,
              steps,
              cfg,
              sampler,
              scheduler,
              loraName: loraName || null,
              loraStrength,
              positivePrompt,
              negativePrompt,
              styleProfileVersion: lockedStyle.version,
              styleReferenceAssetIds: lockedStyle.referenceAssetIds
            }
          }
        });
        await tx.characterAsset.create({
          data: {
            characterVersionId,
            assetId: asset.id,
            role: CharacterAssetRole.primary_reference,
            origin: 'generated',
            status: 'ready_for_review',
            label: 'Ficha gerada pelo sistema',
            sortOrder: await tx.characterAsset.count({ where: { characterVersionId } })
          }
        });
        await tx.characterVersion.update({
          where: { id: characterVersionId },
          data: {
            status: CharacterVersionStatus.ready_for_review,
            generationCompletedAt: new Date(),
            generationMetadata: {
              provider: result.provider,
              promptId: result.promptId,
              checkpointName,
              width,
              height,
              seed,
              steps,
              cfg,
              sampler,
              scheduler,
              loraName: loraName || null,
              loraStrength,
              positivePrompt,
              negativePrompt,
              styleProfileVersion: lockedStyle.version,
              styleReferenceAssetIds: lockedStyle.referenceAssetIds
            },
            errorMessage: null
          }
        });
      });
      await this.characterProgress(job, 100, 'READY_FOR_REVIEW', 'Ficha do personagem pronta para revisao.', ProcessingJobStatus.completed);
      this.logger.log(`Character generated project=${projectId} character=${characterId} version=${characterVersionId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await this.prisma.characterVersion.update({
        where: { id: characterVersionId },
        data: {
          status: willRetry ? CharacterVersionStatus.queued : CharacterVersionStatus.failed,
          errorMessage: message,
          generationCompletedAt: willRetry ? null : new Date()
        }
      });
      await this.characterProgress(
        job,
        0,
        willRetry ? 'RETRYING' : 'FAILED',
        willRetry ? `Tentativa falhou; o BullMQ tentara novamente: ${message}` : `Falha ao gerar personagem: ${message}`,
        willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed,
        message
      );
      throw error;
    }
  }

  private async processSupplementaryCharacterAsset(job: Job<ChildrenClipCharacterGenerationJobPayload>) {
    const { projectId, organizationId, characterId, characterVersionId, characterAssetId } = job.data;
    const record = await this.prisma.characterAsset.findFirst({
      where: {
        id: characterAssetId,
        characterVersionId,
        characterVersion: { characterId, character: { organizationId, projectLinks: { some: { projectId } } } }
      },
      include: {
        characterVersion: {
          include: {
            character: true,
            assets: { where: { assetId: { not: null }, status: 'approved' }, include: { asset: true }, orderBy: { sortOrder: 'asc' } }
          }
        }
      }
    });
    if (!record?.generationPrompt || !characterAssetId) throw new Error('Asset complementar de personagem nao esta pronto para geracao');
    const styleLock = await this.prisma.childrenClipStyleProfile.findUnique({ where: { projectId } });
    if (styleLock?.status === 'stale') throw new Error(styleLock.staleReason || 'O Project Style Lock esta desatualizado');
    const lockedStyle = this.styleLockPrompt(styleLock);
    const referenceLink = record.characterVersion.assets.find((item) => item.role === 'primary_reference' && item.asset)
      ?? record.characterVersion.assets.find((item) => item.asset);
    if (!referenceLink?.asset) throw new Error('A geracao complementar precisa de uma referencia de personagem aprovada');
    const checkpointName = this.config.get<string>('visual.characterCheckpointName', '').trim();
    const width = this.config.get<number>('visual.characterWidth', 1024);
    const height = this.config.get<number>('visual.characterHeight', 1024);
    const seed = record.seed ?? Math.floor(Math.random() * 2_147_483_646);
    const loraName = this.config.get<string>('visual.characterLoraName', '').trim();
    const roleDirection: Record<string, string> = {
      front_view: 'full body front view, neutral production pose', side_view: 'full body strict side profile view',
      back_view: 'full body back view', portrait: 'clean head and shoulders portrait',
      expression: `facial expression: ${record.label}`, pose: `full body action pose: ${record.label}`,
      mouth_shape: `isolated close-up mouth sprite pronouncing ${record.label}, transparent or plain background`,
      eye_state: `clean face detail with eyes ${record.label}`
    };
    const positivePrompt = [
      lockedStyle.positive,
      'preserve exactly the same original children animation character identity, species, face, colors, outfit and proportions from the reference image',
      roleDirection[record.role] ?? record.role,
      record.generationPrompt,
      record.characterVersion.description
    ].filter(Boolean).join(', ');
    const negativePrompt = [
      ...lockedStyle.negative,
      record.negativePrompt,
      'different character, changed species, changed clothes, changed colors, photorealistic, 3d, text, watermark, duplicate body, extra limbs, malformed'
    ].filter(Boolean).join(', ');
    await this.prisma.characterAsset.update({
      where: { id: characterAssetId },
      data: { status: CharacterAssetStatus.generating, seed, errorMessage: null, generationStartedAt: new Date(), generationEndedAt: null }
    });
    try {
      await this.characterProgress(job, 10, 'STARTING', `Worker iniciou ${record.role} (${record.label}).`);
      const result = await this.comfyUi.generateStillImage({
        positivePrompt, negativePrompt, checkpointName, width, height,
        steps: this.config.get<number>('visual.characterSteps', 30),
        cfg: this.config.get<number>('visual.characterCfg', 6.5),
        sampler: this.config.get<string>('visual.characterSampler', 'dpmpp_2m'),
        scheduler: this.config.get<string>('visual.characterScheduler', 'karras'),
        seed, filenamePrefix: `children-clips/character-${characterId}-${record.role}-${characterAssetId}`,
        loraName: loraName || null, loraStrength: this.config.get<number>('visual.characterLoraStrength', 1),
        referenceImagePath: this.storage.getAbsolutePath(referenceLink.asset.storagePath),
        denoise: record.role === 'mouth_shape' || record.role === 'eye_state' ? 0.3 : 0.48,
        onGpuWaiting: (owner) => this.characterProgress(job, 22, 'WAITING_GPU', `Asset do personagem aguardando a GPU${owner ? `, ocupada por ${owner.split(':')[0]}` : ''}.`)
      });
      await this.characterProgress(job, 78, 'SAVING_ASSET', 'Imagem complementar gerada. Salvando para revisao.');
      const storagePath = this.storage.buildCharacterAssetPath(organizationId, projectId, characterId, record.characterVersion.versionNumber, `${record.role}-${characterAssetId}`);
      const absolutePath = await this.storage.ensureParentDirectory(storagePath);
      await writeFile(absolutePath, result.buffer);
      const sizeBytes = Number((await stat(absolutePath)).size);
      await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            organizationId, projectId, type: AssetType.image, mimeType: 'image/png', storagePath, sizeBytes, width, height,
            metadata: { source: 'comfyui-reference-img2img', characterId, characterVersionId, characterAssetId, role: record.role, label: record.label, promptId: result.promptId, seed, positivePrompt, negativePrompt, styleProfileVersion: lockedStyle.version, styleReferenceAssetIds: lockedStyle.referenceAssetIds }
          }
        });
        await tx.characterAsset.update({
          where: { id: characterAssetId },
          data: {
            assetId: asset.id, status: CharacterAssetStatus.ready_for_review, generationEndedAt: new Date(), errorMessage: null,
            generationMetadata: { provider: result.provider, promptId: result.promptId, seed, denoise: record.role === 'mouth_shape' || record.role === 'eye_state' ? 0.3 : 0.48, referenceAssetId: referenceLink.asset!.id, positivePrompt, negativePrompt, styleProfileVersion: lockedStyle.version, styleReferenceAssetIds: lockedStyle.referenceAssetIds }
          }
        });
      });
      await this.characterProgress(job, 100, 'READY_FOR_REVIEW', 'Asset complementar pronto para revisao.', ProcessingJobStatus.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await this.prisma.characterAsset.update({
        where: { id: characterAssetId },
        data: { status: willRetry ? CharacterAssetStatus.queued : CharacterAssetStatus.failed, errorMessage: message, generationEndedAt: willRetry ? null : new Date() }
      });
      await this.characterProgress(job, 0, willRetry ? 'RETRYING' : 'FAILED', willRetry ? `Geracao complementar falhou; o BullMQ tentara novamente: ${message}` : `Falha no asset complementar: ${message}`, willRetry ? ProcessingJobStatus.retrying : ProcessingJobStatus.failed, message);
      throw error;
    }
  }

  private async progress(
    bullJobId: string,
    progress: number,
    stage: string,
    message: string,
    status: ProcessingJobStatus = ProcessingJobStatus.active,
    errorMessage: string | null = null
  ) {
    const processingJob = await this.prisma.processingJob.findFirst({ where: { bullJobId } });
    if (!processingJob) return;
    const entries = Array.isArray(processingJob.activityLog) ? [...processingJob.activityLog] : [];
    entries.push({ stage, message, progress, timestamp: new Date().toISOString() });
    await this.prisma.processingJob.update({
      where: { id: processingJob.id },
      data: {
        status,
        progress,
        detailMessage: message,
        errorMessage,
        activityLog: entries.slice(-200) as Prisma.InputJsonValue
      }
    });
  }

  private async audioProgress(
    job: Job<ChildrenClipAudioAnalysisJobPayload>,
    progress: number,
    stage: string,
    message: string,
    status: ProcessingJobStatus = ProcessingJobStatus.active,
    errorMessage: string | null = null
  ) {
    await job.updateProgress({ progress, stage, message });
    await this.progress(String(job.id), progress, stage, message, status, errorMessage);
    this.logger.log(`[${String(job.id)}] ${stage} ${progress}%: ${message}`);
  }

  private async characterProgress(
    job: Job<ChildrenClipCharacterGenerationJobPayload>,
    progress: number,
    stage: string,
    message: string,
    status: ProcessingJobStatus = ProcessingJobStatus.active,
    errorMessage: string | null = null
  ) {
    await job.updateProgress({ progress, stage, message });
    await this.progress(String(job.id), progress, stage, message, status, errorMessage);
    this.logger.log(`[${String(job.id)}] ${stage} ${progress}%: ${message}`);
  }

  private async planProgress(
    job: Job<ChildrenClipPlanGenerationJobPayload>,
    progress: number,
    stage: string,
    message: string,
    status: ProcessingJobStatus = ProcessingJobStatus.active,
    errorMessage: string | null = null
  ) {
    await job.updateProgress({ progress, stage, message });
    await this.progress(String(job.id), progress, stage, message, status, errorMessage);
    this.logger.log(`[${String(job.id)}] ${stage} ${progress}%: ${message}`);
  }

  private async assetProgress(
    job: Job<ChildrenClipAssetGenerationJobPayload>,
    progress: number,
    stage: string,
    message: string,
    status: ProcessingJobStatus = ProcessingJobStatus.active,
    errorMessage: string | null = null
  ) {
    await job.updateProgress({ progress, stage, message });
    await this.progress(String(job.id), progress, stage, message, status, errorMessage);
    this.logger.log(`[${String(job.id)}] ${stage} ${progress}%: ${message}`);
  }

  private async renderProgress(
    job: Job<ChildrenClipShotRenderJobPayload>,
    renderAttemptId: string,
    progress: number,
    stage: string,
    message: string,
    status: ProcessingJobStatus = ProcessingJobStatus.active,
    errorMessage: string | null = null
  ) {
    await job.updateProgress({ progress, stage, message });
    await Promise.all([
      this.progress(String(job.id), progress, stage, message, status, errorMessage),
      this.prisma.childrenClipShotRenderAttempt.update({
        where: { id: renderAttemptId }, data: { progress, stage, errorMessage }
      })
    ]);
    this.logger.log(`[${String(job.id)}] ${stage} ${progress}%: ${message}`);
  }

  private async heroProgress(
    job: Job<ChildrenClipHeroShotJobPayload>, heroAttemptId: string, progress: number, stage: string,
    message: string, status: ProcessingJobStatus = ProcessingJobStatus.active, errorMessage: string | null = null
  ) {
    await job.updateProgress({ progress, stage, message });
    await Promise.all([
      this.progress(String(job.id), progress, stage, message, status, errorMessage),
      this.prisma.childrenClipHeroShotAttempt.update({ where: { id: heroAttemptId }, data: { progress, stage, errorMessage } })
    ]);
    this.logger.log(`[${String(job.id)}] ${stage} ${progress}%: ${message}`);
  }

  private heroErrorCode(message: string) {
    const httpStatus = message.match(/SnapGen HTTP (\d{3})/)?.[1];
    if (httpStatus) return `SNAPGEN_HTTP_${httpStatus}`;
    if (/limite|timeout|excedeu/i.test(message)) return 'GENERATION_TIMEOUT';
    if (/cancel/i.test(message)) return 'GENERATION_CANCELLED';
    if (/video|FFprobe|invalido|incompleto/i.test(message)) return 'INVALID_VIDEO_RESULT';
    return 'VIDEO_GENERATION_FAILED';
  }

  private async finalProgress(
    job: Job<ChildrenClipFinalRenderJobPayload>, finalRenderId: string, progress: number, stage: string,
    message: string, status: ProcessingJobStatus = ProcessingJobStatus.active, errorMessage: string | null = null
  ) {
    await job.updateProgress({ progress, stage, message });
    await Promise.all([
      this.progress(String(job.id), progress, stage, message, status, errorMessage),
      this.prisma.childrenClipFinalRender.update({ where: { id: finalRenderId }, data: { progress, stage, errorMessage } })
    ]);
    this.logger.log(`[${String(job.id)}] ${stage} ${progress}%: ${message}`);
  }

  private async withPlanHeartbeat<T>(
    job: Job<ChildrenClipPlanGenerationJobPayload>,
    operation: Promise<T>,
    initialProgress = 18,
    maximumProgress = 42,
    message = 'O Ollama continua estruturando a direcao criativa.'
  ) {
    let progress = initialProgress;
    const timer = setInterval(() => {
      progress = Math.min(maximumProgress, progress + 1);
      void this.planProgress(job, progress, 'WAITING_OLLAMA', message)
        .catch((error) => this.logger.warn(`Could not persist planning heartbeat: ${String(error)}`));
    }, 15_000);
    try {
      return await operation;
    } finally {
      clearInterval(timer);
    }
  }

  private shotPlanningBatches<T extends { index: number }>(shots: T[], maximumShots: number): T[][] {
    const batches: T[][] = [];
    for (let index = 0; index < shots.length; index += maximumShots) batches.push(shots.slice(index, index + maximumShots));
    return batches;
  }

  private compactVisualContext(
    value: unknown,
    fallbackStyle: string,
    characters: Array<{ name: string; roleName: string | null; description: string }>
  ) {
    const bible = this.jsonRecord(value);
    const rules = Array.isArray(bible.characterRules)
      ? bible.characterRules.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
      : [];
    return {
      style: this.limitText(bible.style, 450) || this.limitText(fallbackStyle, 450),
      palette: Array.isArray(bible.palette) ? bible.palette.slice(0, 8) : null,
      lighting: this.limitText(bible.lighting, 260),
      backgroundStyle: this.limitText(bible.backgroundStyle, 320),
      entities: characters.map((character) => {
        const rule = rules.find((item) => String(item.name ?? '').toLowerCase() === character.name.toLowerCase());
        return {
          name: character.name,
          type: typeof rule?.type === 'string' ? rule.type : 'character',
          role: this.limitText(character.roleName, 140),
          identity: this.limitText(typeof rule?.identity === 'string' ? rule.identity : character.description, 240)
        };
      })
    };
  }

  private normalizeCreativePlanResponse(value: CreativePlanResponse): CreativePlanResponse {
    const record = value as unknown as Record<string, unknown>;
    if (typeof record.shotIndex === 'number') return { shotPlans: [record as unknown as CreativeShotPlan] };
    return value;
  }

  private normalizeShotText(value: unknown): string {
    return typeof value === 'string'
      ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
      : '';
  }

  private shotAuditIssue(
    plan: CreativeShotPlan,
    previousPlans: CreativeShotPlan[],
    introductionSchedule: Array<{ name: string; type: string; firstShotIndex: number }>,
    shotIndex: number
  ): string | null {
    const action = this.normalizeShotText(plan.action);
    if (action && previousPlans.some((previous) => this.normalizeShotText(previous.action) === action)) {
      return 'acao visual repetida';
    }
    const positiveText = this.normalizeShotText([
      plan.primaryFocus, plan.purpose, plan.action, plan.composition, plan.camera,
      plan.motionIntent, plan.continuityFromPreviousShot, JSON.stringify(plan.characterPlacement ?? [])
    ].filter((value): value is string => typeof value === 'string').join(' '));
    for (const entity of introductionSchedule.filter((item) => item.firstShotIndex > shotIndex)) {
      if (this.containsShotEntity(positiveText, entity.name)
        || [...(plan.allowedEntities ?? []), ...(plan.characters ?? [])].some((name) => this.normalizeShotText(name) === this.normalizeShotText(entity.name))) {
        return `entidade futura ${entity.name} aparece antes da tomada ${entity.firstShotIndex + 1}`;
      }
    }
    const vehicleNames = introductionSchedule
      .filter((entity) => /\b(vehicle|veiculo|trem|train|bus|onibus)\b/.test(this.normalizeShotText(entity.type)))
      .map((entity) => entity.name);
    if (/\b(em cima|sobre o teto) d[oa] (trem|veiculo|carro|onibus)\b/.test(positiveText)
      || vehicleNames.some((name) => new RegExp(`\\b(em cima|sobre o teto) d[oa] ${this.escapeRegExp(this.normalizeShotText(name))}\\b`).test(positiveText))) {
      return 'encenacao infantil insegura em cima de veiculo';
    }
    return null;
  }

  private containsShotEntity(normalizedText: string, name: string): boolean {
    const target = this.escapeRegExp(this.normalizeShotText(name));
    return Boolean(target && new RegExp(`(^|[^a-z0-9])${target}($|[^a-z0-9])`).test(normalizedText));
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private compactNarrativeContext(value: unknown, sectionTitles: string[]) {
    const narrative = this.jsonRecord(value);
    const normalizedSections = new Set(sectionTitles.map((item) => item.toLowerCase()));
    const storyBeats: unknown[] = [];
    if (Array.isArray(narrative.storyBeats)) {
      for (const item of narrative.storyBeats) {
        if (typeof item === 'string') {
          storyBeats.push(this.limitText(item, 320));
          continue;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const beat = item as Record<string, unknown>;
        if (typeof beat.section === 'string' && !normalizedSections.has(beat.section.toLowerCase())) continue;
        storyBeats.push({
          section: beat.section,
          focus: beat.focus,
          purpose: this.limitText(beat.purpose, 180),
          visualGuidance: this.limitText(beat.visualGuidance, 320)
        });
      }
    }
    return {
      storyBeats,
      characterIntroductionOrder: Array.isArray(narrative.characterIntroductionOrder) ? narrative.characterIntroductionOrder : [],
      entityIntroductions: Array.isArray(narrative.entityIntroductions) ? narrative.entityIntroductions : [],
      continuityRules: Array.isArray(narrative.continuityRules)
        ? narrative.continuityRules.filter((item): item is string => typeof item === 'string').slice(0, 12).map((item) => this.limitText(item, 220))
        : []
    };
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private styleLockPrompt(value: { status: string; versionNumber: number; profile: Prisma.JsonValue; negativeConstraints: Prisma.JsonValue; styleReferenceAssetIds: Prisma.JsonValue } | null) {
    if (!value || value.status !== 'locked') return { positive: '', negative: [] as string[], version: null as number | null, referenceAssetIds: [] as string[] };
    const profile = this.jsonRecord(value.profile);
    const metrics = this.jsonRecord(profile.colorMetrics);
    return {
      positive: [
        profile.medium, profile.lineStyle, profile.shading, profile.texture, profile.lighting,
        Array.isArray(profile.palette) ? `approved project palette: ${profile.palette.join(', ')}` : null,
        metrics.averageSaturation !== undefined ? `match approved saturation ${metrics.averageSaturation} and contrast ${metrics.contrast}` : null,
        profile.maxBackgroundDetail ? `match project detail level ${profile.maxBackgroundDetail}` : null,
        `Project Style Lock version ${value.versionNumber}; exact same animated series visual language`
      ].filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join(', '),
      negative: this.stringArray(value.negativeConstraints),
      version: value.versionNumber,
      referenceAssetIds: this.stringArray(value.styleReferenceAssetIds)
    };
  }

  private limitText(value: unknown, maximumLength: number): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim();
    return text.length > maximumLength ? `${text.slice(0, maximumLength - 3)}...` : text;
  }

  private numberArray(value: Prisma.JsonValue | null): number[] {
    return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
  }

  private stringArray(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private characterPlacements(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const subjects = (value as Record<string, Prisma.JsonValue>).subjects;
    if (!Array.isArray(subjects)) return [];
    return subjects.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const subject = item as Record<string, Prisma.JsonValue>;
      if (typeof subject.versionId !== 'string') return [];
      return [{
        versionId: subject.versionId,
        xPercent: typeof subject.xPercent === 'number' ? subject.xPercent : 50,
        yPercent: typeof subject.yPercent === 'number' ? subject.yPercent : 76,
        scalePercent: typeof subject.scalePercent === 'number' ? subject.scalePercent : 48
      }];
    });
  }

  private timedWords(
    value: Prisma.JsonValue | null,
    fallbackText: string,
    startSeconds: number,
    endSeconds: number
  ): TimedWord[] {
    if (Array.isArray(value)) {
      const words = value.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const word = item as Record<string, Prisma.JsonValue>;
        return typeof word.text === 'string' && typeof word.startSeconds === 'number' && typeof word.endSeconds === 'number'
          ? [{ text: word.text, startSeconds: word.startSeconds, endSeconds: word.endSeconds }]
          : [];
      });
      if (words.length) return words;
    }
    const tokens = fallbackText.split(/\s+/).filter(Boolean);
    return tokens.map((text, index) => ({
      text,
      startSeconds: startSeconds + ((endSeconds - startSeconds) * index) / Math.max(1, tokens.length),
      endSeconds: startSeconds + ((endSeconds - startSeconds) * (index + 1)) / Math.max(1, tokens.length)
    }));
  }

  private async assetDataUrl(storagePath: string, mimeType: string) {
    const buffer = await readFile(this.storage.getAbsolutePath(storagePath));
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  private validateTimeline(shots: Array<{ startSeconds: number; endSeconds: number }>, duration: number) {
    if (!shots.length) throw new Error('O planejamento nao produziu nenhuma tomada');
    if (Math.abs(shots[0].startSeconds) > 0.01 || Math.abs(shots[shots.length - 1].endSeconds - duration) > 0.01) {
      throw new Error('A timeline gerada nao cobre toda a musica');
    }
    for (let index = 0; index < shots.length; index += 1) {
      if (shots[index].endSeconds <= shots[index].startSeconds) throw new Error(`Tomada ${index + 1} possui duracao invalida`);
      if (index > 0 && Math.abs(shots[index].startSeconds - shots[index - 1].endSeconds) > 0.01) {
        throw new Error(`Timeline descontinua entre tomadas ${index} e ${index + 1}`);
      }
    }
  }

  private averageEnergy(points: AudioEnergyPoint[], start: number, end: number) {
    const selected = points.filter((point) => point.time >= start && point.time < end);
    if (!selected.length) return 0.5;
    return Number((selected.reduce((sum, point) => sum + point.energy, 0) / selected.length).toFixed(3));
  }

  private refineSectionBoundaries<T extends { startSeconds: number; endSeconds: number }>(
    sections: T[],
    energy: AudioEnergyPoint[],
    beats: number[],
    duration: number
  ): T[] {
    if (sections.length < 2 || energy.length < 8) return sections;
    const boundaries = [0];
    for (let index = 1; index < sections.length; index += 1) {
      const expected = sections[index].startSeconds;
      const candidates = energy.filter((point) => Math.abs(point.time - expected) <= 4);
      let selected = expected;
      let selectedScore = -Infinity;
      for (const candidate of candidates) {
        const before = this.averageEnergy(energy, Math.max(0, candidate.time - 1.5), candidate.time);
        const after = this.averageEnergy(energy, candidate.time, Math.min(duration, candidate.time + 1.5));
        const score = Math.abs(after - before) + (1 - candidate.energy) * 0.12;
        if (score > selectedScore) { selectedScore = score; selected = candidate.time; }
      }
      const nearestBeat = beats.reduce((nearest, beat) =>
        Math.abs(beat - selected) < Math.abs(nearest - selected) ? beat : nearest, selected);
      const minimum = boundaries[index - 1] + 2;
      const maximum = duration - (sections.length - index) * 2;
      boundaries.push(Number(Math.min(maximum, Math.max(minimum, nearestBeat)).toFixed(3)));
    }
    boundaries.push(duration);
    return sections.map((section, index) => ({
      ...section,
      startSeconds: boundaries[index],
      endSeconds: boundaries[index + 1]
    }));
  }
}
