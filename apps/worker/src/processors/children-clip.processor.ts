import { stat, writeFile } from 'node:fs/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetType, CharacterAssetRole, CharacterVersionStatus, ChildrenClipShotAssetStatus, Prisma, ProcessingJobStatus } from '@prisma/client';
import type { ChildrenClipAssetGenerationJobPayload, ChildrenClipAudioAnalysisJobPayload, ChildrenClipCharacterGenerationJobPayload, ChildrenClipPlanGenerationJobPayload } from '@video/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { ComfyUiClientService } from '../services/comfyui-client.service';
import { RenderStorageService } from '../services/render-storage.service';
import { OllamaClientService } from '../services/ollama-client.service';
import { ChildrenClipAudioAnalysisService, type AudioEnergyPoint } from '../services/children-clip-audio-analysis.service';
import { ChildrenClipLyricsAlignmentService } from '../services/children-clip-lyrics-alignment.service';
import { MusicStructureService } from '../services/music-structure.service';
import { ChildrenClipPlanningService, type CreativePlanResponse } from '../services/children-clip-planning.service';

interface OptimizedCharacterPrompt {
  positivePrompt: string;
  negativePrompt: string;
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
    @Inject(ChildrenClipPlanningService) private readonly planning: ChildrenClipPlanningService
  ) {}

  async processAssetGeneration(job: Job<ChildrenClipAssetGenerationJobPayload>) {
    const { projectId, organizationId, shotAssetId } = job.data;
    const bullJobId = String(job.id);
    const shotAsset = await this.prisma.childrenClipShotAsset.findFirst({
      where: { id: shotAssetId, shot: { projectId, project: { organizationId, deletedAt: null } } },
      include: {
        shot: {
          include: {
            project: { include: { childrenClip: true, childrenClipPlan: true } }
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
    const isBackground = shotAsset.role === 'background';
    const visualBible = shotAsset.shot.project.childrenClipPlan?.visualBible;
    const positivePrompt = [
      'original polished 2D children animation, flat vector illustration, clean bold outlines, simple cel shading, production-ready separated visual asset',
      isBackground ? 'empty environment background plate, no characters, wide composition with clear foreground middle ground and background layers' : `isolated ${shotAsset.role} visual asset`,
      shotAsset.generationPrompt,
      visualBible ? `art direction: ${JSON.stringify(visualBible)}` : null
    ].filter(Boolean).join(', ');
    const negativePrompt = [
      shotAsset.negativePrompt,
      'photorealistic, realistic skin, 3d render, text, letters, logo, watermark, signature, scary, violence, weapon, malformed, low quality',
      isBackground ? 'person, people, child, character, animal, creature, mascot' : null
    ].filter(Boolean).join(', ');

    await this.prisma.$transaction([
      this.prisma.childrenClipShotAsset.update({
        where: { id: shotAssetId },
        data: { status: 'generating', bullJobId, seed, errorMessage: null, generationStartedAt: new Date(), generationEndedAt: null }
      }),
      this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'generating_assets' } })
    ]);
    try {
      await this.assetProgress(job, 8, 'STARTING', 'Worker iniciou a producao do asset da tomada.');
      await this.assetProgress(job, 18, 'LOADING_MODEL', `Carregando checkpoint ${checkpointName}.`);
      await this.assetProgress(job, 25, 'GENERATING', `Gerando ${shotAsset.role} em ${dimensions.width}x${dimensions.height}.`);
      const result = await this.comfyUi.generateStillImage({
        positivePrompt, negativePrompt, checkpointName, ...dimensions, steps, cfg, sampler, scheduler, seed,
        filenamePrefix: `children-clips/shot-${shotAsset.shot.index + 1}-${shotAsset.role}-v${shotAsset.versionNumber}`,
        loraName: loraName || null, loraStrength
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
            metadata: { source: 'comfyui', shotAssetId, shotId: shotAsset.shotId, role: shotAsset.role, promptId: result.promptId, checkpointName, seed, steps, cfg, sampler, scheduler, loraName: loraName || null, loraStrength, positivePrompt, negativePrompt }
          }
        });
        await tx.childrenClipShotAsset.update({
          where: { id: shotAssetId },
          data: {
            assetId: asset.id, status: ChildrenClipShotAssetStatus.ready_for_review,
            generationEndedAt: new Date(), errorMessage: null,
            generationMetadata: { provider: result.provider, promptId: result.promptId, checkpointName, ...dimensions, seed, steps, cfg, sampler, scheduler, loraName: loraName || null, loraStrength, positivePrompt, negativePrompt }
          }
        });
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
    const { projectId, organizationId, revisionInstruction } = job.data;
    const bullJobId = String(job.id);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null },
      include: {
        childrenClip: true,
        childrenClipAudioAnalysis: true,
        childrenClipPlan: true,
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
      const creative = await this.withPlanHeartbeat(job, this.ollama.generateJson<CreativePlanResponse>([
        {
          role: 'system',
          content: 'You are a production designer and director for original 2D children music videos. Return JSON only with visualBible, narrative and sectionPlans. Keep actions safe, simple, joyful and feasible with layered 2D animation. sectionPlans must use the supplied section titles exactly.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: project.title,
            concept: project.childrenClip.concept,
            visualStyle: project.childrenClip.visualStyle,
            audience: [project.childrenClip.audienceAgeMin, project.childrenClip.audienceAgeMax],
            sections: project.musicSections.map((section) => ({ title: section.title, type: section.type, lyrics: section.lyricsExcerpt, energy: section.energy })),
            characters: project.characterLinks.map((link) => ({ name: link.character.name, role: link.roleName, description: link.selectedVersion!.description })),
            revisionInstruction: revisionInstruction || null
          })
        }
      ]));
      await this.planProgress(job, 48, 'PLANNING_SECTIONS', `Direcao narrativa definida para ${project.musicSections.length} secoes.`);
      const result = this.planning.build({
        title: project.title,
        concept: project.childrenClip.concept,
        visualStyle: project.childrenClip.visualStyle,
        audienceAgeMin: project.childrenClip.audienceAgeMin,
        audienceAgeMax: project.childrenClip.audienceAgeMax,
        durationSeconds: project.childrenClipAudioAnalysis.durationSeconds!,
        beatGrid: this.numberArray(project.childrenClipAudioAnalysis.beatGrid),
        sections: project.musicSections,
        cues: project.childrenClipLyricCues,
        characters: project.characterLinks.map((link) => ({
          name: link.character.name,
          roleName: link.roleName,
          versionId: link.selectedVersion!.id,
          description: link.selectedVersion!.description
        })),
        creative
      });
      await this.planProgress(job, 72, 'BUILDING_TIMELINE', `Montando ${result.shots.length} tomadas na grade musical.`);
      this.validateTimeline(result.shots, project.childrenClipAudioAnalysis.durationSeconds!);
      await this.planProgress(job, 88, 'VALIDATING', 'Validando cobertura, continuidade e identidades aprovadas.');

      await this.prisma.$transaction(async (tx) => {
        await tx.childrenClipShot.deleteMany({ where: { projectId } });
        await tx.childrenClipShot.createMany({
          data: result.shots.map((shot) => ({
            projectId,
            musicSectionId: shot.musicSectionId,
            index: shot.index,
            title: shot.title,
            description: shot.description,
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
            layers: shot.layers as Prisma.InputJsonValue,
            motionPreset: shot.motionPreset
          }))
        });
        await tx.childrenClipPlan.update({
          where: { projectId },
          data: {
            status: 'ready_for_review',
            versionNumber: project.childrenClipPlan?.visualBible ? { increment: 1 } : 1,
            visualBible: result.visualBible as Prisma.InputJsonValue,
            narrative: result.narrative as Prisma.InputJsonValue,
            generationMetadata: {
              provider: creative ? 'ollama+deterministic-timeline' : 'deterministic-fallback',
              shotCount: result.shots.length,
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
        'flat 2D vector cartoon, simple cel shading, clean bold outlines, colorful original children animation design',
        optimizedPrompt?.positivePrompt?.trim() || version.generationPrompt
      ].join(', ');
      const safetyNegativePrompt =
        'photorealistic, realistic skin, 3d render, realistic fur, realistic feathers, text, letters, logo, watermark, signature, human when animal is requested, multiple different characters, inconsistent outfit, cropped body, extra arms, extra legs, malformed hands, duplicate body';
      const negativePrompt = [optimizedPrompt?.negativePrompt?.trim(), safetyNegativePrompt]
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
        loraStrength
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
              negativePrompt
            }
          }
        });
        await tx.characterAsset.create({
          data: {
            characterVersionId,
            assetId: asset.id,
            role: CharacterAssetRole.primary_reference,
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
              positivePrompt
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

  private async withPlanHeartbeat<T>(job: Job<ChildrenClipPlanGenerationJobPayload>, operation: Promise<T>) {
    let progress = 18;
    const timer = setInterval(() => {
      progress = Math.min(42, progress + 3);
      void this.planProgress(job, progress, 'WAITING_OLLAMA', 'O Ollama continua estruturando a direcao criativa.')
        .catch((error) => this.logger.warn(`Could not persist planning heartbeat: ${String(error)}`));
    }, 15_000);
    try {
      return await operation;
    } finally {
      clearInterval(timer);
    }
  }

  private numberArray(value: Prisma.JsonValue | null): number[] {
    return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
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
