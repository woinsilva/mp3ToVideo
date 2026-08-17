import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectStatus, SceneStatus } from '@prisma/client';
import type { ProjectProcessingJobPayload } from '@video/shared';

import { PrismaService } from '../database/prisma.service';
import { AudioExcerptService } from './audio-excerpt.service';
import { AudioMetadataService } from './audio-metadata.service';
import { LyricsGenerationService } from './lyrics-generation.service';
import { MusicStructureService } from './music-structure.service';
import { ProcessingProgressService } from './processing-progress.service';
import { ProjectPipelineStateService } from './project-pipeline-state.service';
import { ProjectRenderService } from './project-render.service';
import { ScenePlanningService } from './scene-planning.service';
import { ScenePromptGenerationService } from './scene-prompt-generation.service';
import type { ScenePromptDraft } from './scene-prompt.service';
import { StoryboardGenerationService } from './storyboard-generation.service';

@Injectable()
export class ProjectProcessingPipelineService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(ProjectPipelineStateService)
    private readonly projectPipelineStateService: ProjectPipelineStateService,
    @Inject(ProcessingProgressService)
    private readonly processingProgressService: ProcessingProgressService,
    @Inject(AudioMetadataService)
    private readonly audioMetadataService: AudioMetadataService,
    @Inject(AudioExcerptService)
    private readonly audioExcerptService: AudioExcerptService,
    @Inject(LyricsGenerationService)
    private readonly lyricsGenerationService: LyricsGenerationService,
    @Inject(MusicStructureService)
    private readonly musicStructureService: MusicStructureService,
    @Inject(StoryboardGenerationService)
    private readonly storyboardGenerationService: StoryboardGenerationService,
    @Inject(ScenePlanningService)
    private readonly scenePlanningService: ScenePlanningService,
    @Inject(ScenePromptGenerationService)
    private readonly scenePromptGenerationService: ScenePromptGenerationService,
    @Inject(ProjectRenderService)
    private readonly projectRenderService: ProjectRenderService
  ) {}

  async run(payload: ProjectProcessingJobPayload): Promise<ProjectStatus> {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: payload.projectId,
        organizationId: payload.organizationId,
        deletedAt: null
      },
      include: {
        track: true,
        sourceImageAsset: true,
        lyrics: true,
        storyboard: true,
        musicSections: {
          orderBy: {
            startSeconds: 'asc'
          }
        },
        scenes: {
          include: {
            prompt: true,
            videoAsset: true,
            referenceImageAsset: true
          },
          orderBy: {
            index: 'asc'
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found for processing');
    }

    const isImageProject = project.generationMode === 'image';
    const isDirectVideoProject = project.generationMode === 'prompt' || isImageProject;

    if (!isDirectVideoProject && !project.track) {
      throw new NotFoundException('Project track not found for processing');
    }

    if (isDirectVideoProject && (!project.generationPrompt || !project.clipDurationSeconds)) {
      throw new NotFoundException('Prompt and duration not found for direct video processing');
    }

    if (isImageProject && !project.sourceImageAsset) {
      throw new NotFoundException('Source image not found for image-to-video processing');
    }

    const sourceDurationSeconds = isDirectVideoProject
      ? project.clipDurationSeconds!
      : await this.audioMetadataService.resolveDurationSeconds(project.track!.storagePath);
    const requestedClipDurationSeconds = project.clipDurationSeconds
      ? Math.min(project.clipDurationSeconds, sourceDurationSeconds)
      : null;
    const effectiveDurationSeconds = requestedClipDurationSeconds ?? sourceDurationSeconds;

    const canResumeFromExistingScenes =
      project.scenes.length > 0 &&
      project.scenes.every((scene) => scene.prompt) &&
      project.storyboard !== null &&
      project.musicSections.length > 0;

    if (canResumeFromExistingScenes) {
      await this.projectPipelineStateService.update(
        project.id,
        ProjectStatus.rendering,
        95,
        'Retomando pipeline a partir das cenas e prompts ja persistidos.',
        {
          stage: 'rendering',
          message: 'Retomando pipeline a partir das cenas ja planejadas.'
        }
      );

      await this.processingProgressService.heartbeat(
        project.id,
        95,
        `Retomando render com ${project.scenes.length} cenas existentes. Cenas concluidas com arquivo valido serao reaproveitadas.`,
        {
          stage: 'rendering',
          message:
            `Retomando render com ${project.scenes.length} cenas existentes. ` +
            'Cenas concluidas serao reaproveitadas quando o arquivo ainda existir.'
        }
      );

      await this.projectRenderService.render({
        organizationId: payload.organizationId,
        projectId: project.id,
        generationMode: project.generationMode,
        audioPath: !project.track
          ? null
          : project.clipDurationSeconds
          ? await this.audioExcerptService.buildInitialExcerpt(
              project.id,
              project.track.storagePath,
              effectiveDurationSeconds
            )
          : project.track.storagePath,
        durationSeconds: effectiveDurationSeconds,
        visualCheckpointName: project.visualCheckpointName,
        stabilityTest: project.stabilityTest,
        wanOnly: project.wanOnly,
        generationSeed: project.generationSeed,
        generationCfg: project.generationCfg,
        generationSteps: project.generationSteps,
        generationFps: project.generationFps,
        scenes: project.scenes.map((scene) => ({
          id: scene.id,
          title: scene.title,
          durationSeconds: scene.durationSeconds,
          sectionType:
            project.musicSections.find((section) => section.id === scene.musicSectionId)?.type ?? 'verse',
          status: scene.status,
          visualProvider: scene.visualProvider,
          videoAssetStoragePath: scene.videoAsset?.storagePath ?? null,
          referenceImageStoragePath: scene.referenceImageAsset?.storagePath ?? null,
          referenceImageAssetId: scene.referenceImageAsset?.id ?? null,
          referenceImageWidth: scene.referenceImageAsset?.width ?? null,
          referenceImageHeight: scene.referenceImageAsset?.height ?? null
        }))
      });

      return ProjectStatus.completed;
    }

    await this.projectPipelineStateService.update(
      project.id,
      ProjectStatus.analyzing,
      25,
      isDirectVideoProject
        ? 'Preparando a descricao e a duracao definidas para o video.'
        : 'Lendo metadados do audio e preparando o intervalo que sera usado no clipe.',
      {
        stage: 'analyzing',
        message: isDirectVideoProject
          ? 'Analisando a descricao enviada pelo usuario.'
          : 'Lendo metadados do audio enviado e preparando a analise inicial.'
      }
    );

    await this.processingProgressService.heartbeat(
      project.id,
      28,
      isDirectVideoProject
        ? `Duracao solicitada: ${Math.round(sourceDurationSeconds)}s.`
        : `Duracao original detectada: ${Math.round(sourceDurationSeconds)}s.`,
      {
        stage: 'analyzing',
        message: isDirectVideoProject
          ? `Video configurado com ${Math.round(sourceDurationSeconds)}s.`
          : `Duracao original do audio detectada: ${Math.round(sourceDurationSeconds)}s.`
      }
    );
    if (project.track) {
      await this.prismaService.track.update({
        where: {
          id: project.track.id
        },
        data: {
          durationSeconds: sourceDurationSeconds
        }
      });
    }

    const effectiveAudioPath = !project.track
      ? null
      : requestedClipDurationSeconds
      ? await this.audioExcerptService.buildInitialExcerpt(
          project.id,
          project.track.storagePath,
          effectiveDurationSeconds
        )
      : project.track.storagePath;
    await this.processingProgressService.heartbeat(
      project.id,
      32,
      isDirectVideoProject
        ? `Descricao preparada para gerar ${Math.round(effectiveDurationSeconds)}s de video.`
        : requestedClipDurationSeconds
        ? `Recorte aplicado. O pipeline usara os primeiros ${Math.round(effectiveDurationSeconds)}s do audio.`
        : 'Nenhum recorte aplicado. O audio inteiro sera usado no pipeline.',
      {
        stage: 'analyzing',
        message: isDirectVideoProject
          ? 'Prompt e duracao prontos para o planejamento visual.'
          : requestedClipDurationSeconds
          ? `Recorte inicial aplicado para ${Math.round(effectiveDurationSeconds)}s.`
          : 'Audio completo mantido para processamento.'
      }
    );

    await this.processingProgressService.heartbeat(
      project.id,
      36,
      isDirectVideoProject
        ? 'Usando a descricao como base narrativa do video.'
        : project.lyrics?.source === 'manual'
        ? 'Usando a letra manual fornecida no projeto.'
        : 'Gerando ou normalizando a letra da musica para estruturar o clip.',
      {
        stage: 'analyzing',
        message:
          isDirectVideoProject
            ? 'Usando o prompt do usuario como direcao narrativa.'
            : project.lyrics?.source === 'manual'
            ? 'Usando letra manual existente.'
            : 'Gerando letra da musica para analise estrutural.'
      }
    );
    const generatedLyrics =
      isDirectVideoProject || project.lyrics?.source === 'manual'
        ? null
        : await this.lyricsGenerationService.build(project.title, effectiveAudioPath!);
    const lyrics =
      isDirectVideoProject
        ? {
            source: 'manual' as const,
            rawText: project.generationPrompt!,
            normalizedText: project.generationPrompt!.replace(/\s+/g, ' ').trim().toLowerCase()
          }
        : project.lyrics?.source === 'manual'
        ? project.lyrics
        : await this.prismaService.lyrics.upsert({
            where: {
              projectId: project.id
            },
            update: generatedLyrics!,
            create: {
              projectId: project.id,
              ...generatedLyrics!
            }
          });
    await this.processingProgressService.heartbeat(
      project.id,
      40,
      isDirectVideoProject ? 'Descricao consolidada.' : `Letra pronta via ${lyrics.source}.`,
      {
        stage: 'analyzing',
        message: isDirectVideoProject
          ? `Descricao consolidada: ${this.truncateForActivity(lyrics.rawText, 260)}`
          : `Letra consolidada via ${lyrics.source}. Trecho inicial: ${this.truncateForActivity(lyrics.rawText, 260)}`
      }
    );
    await this.processingProgressService.heartbeat(
      project.id,
      44,
      isDirectVideoProject
        ? 'Descricao pronta. Estruturando a progressao visual do video.'
        : 'Letra pronta. Identificando secoes como intro, versos, refroes e finalizacao.',
      {
        stage: 'analyzing',
        message: isDirectVideoProject
          ? 'Iniciando a estrutura visual da descricao.'
          : 'Letra pronta. Iniciando identificacao da estrutura musical.'
      }
    );

    const sections = this.musicStructureService.build(
      effectiveDurationSeconds,
      isDirectVideoProject ? '' : lyrics.rawText,
      isDirectVideoProject ? '' : lyrics.normalizedText
    );

    const createdSections = await this.prismaService.$transaction(async (tx) => {
      await tx.scenePrompt.deleteMany({
        where: {
          scene: {
            projectId: project.id
          }
        }
      });
      await tx.scene.deleteMany({
        where: {
          projectId: project.id
        }
      });
      await tx.musicSection.deleteMany({
        where: {
          projectId: project.id
        }
      });

      const records = [];

      for (const section of sections) {
        const createdSection = await tx.musicSection.create({
          data: {
            projectId: project.id,
            type: section.type,
            title: section.title,
            startSeconds: section.startSeconds,
            endSeconds: section.endSeconds,
            lyricsExcerpt: section.lyricsExcerpt,
            energy: section.energy
          }
        });

        records.push(createdSection);
      }

      return records;
    });

    await this.projectPipelineStateService.update(
      project.id,
      ProjectStatus.storyboarding,
      55,
      `Estrutura musical mapeada em ${sections.length} blocos. Gerando storyboard visual.`,
      {
        stage: 'storyboarding',
        message: `Estrutura musical mapeada em ${sections.length} blocos. Gerando storyboard.`
      }
    );

    const storyboard = await this.storyboardGenerationService.build(
      project.title,
      isDirectVideoProject ? project.generationPrompt! : lyrics.normalizedText
    );
    await this.processingProgressService.heartbeat(
      project.id,
      66,
      'Storyboard pronto. Planejando a narrativa visual e a distribuicao das cenas.',
      {
        stage: 'storyboarding',
        message: 'Storyboard gerado. Planejando a narrativa visual do clipe.'
      }
    );

    await this.prismaService.storyboard.upsert({
      where: {
        projectId: project.id
      },
      update: storyboard,
      create: {
        projectId: project.id,
        ...storyboard
      }
    });

    await this.projectPipelineStateService.update(
      project.id,
      ProjectStatus.generating_scenes,
      85,
      isDirectVideoProject
        ? 'Storyboard salvo. Planejando a cena descrita pelo usuario.'
        : 'Storyboard salvo. Planejando cenas e prompts visuais para cada trecho da musica.',
      {
        stage: 'generating_scenes',
        message: isDirectVideoProject
          ? 'Storyboard salvo. Iniciando o planejamento da cena por prompt.'
          : 'Storyboard salvo. Iniciando planejamento das cenas.'
      }
    );

    const scenes = this.scenePlanningService.build(
      effectiveDurationSeconds,
      sections,
      storyboard.narrativeSummary,
      project.sceneDurationSeconds
    );
    await this.processingProgressService.heartbeat(
      project.id,
      86,
      `${scenes.length} cenas planejadas. Gerando prompts visuais para cada uma delas.`,
        {
          stage: 'generating_scenes',
          message: `${scenes.length} cenas planejadas para o clipe.`
        }
      );

    for (const [index, section] of sections.entries()) {
      await this.processingProgressService.heartbeat(
        project.id,
        84,
        `Secao ${index + 1} mapeada: ${section.title}.`,
        {
          stage: 'storyboarding',
          message:
            `Secao ${index + 1}/${sections.length}: ${section.title} (${section.startSeconds}s - ${section.endSeconds}s). ` +
            `Trecho da letra: ${this.truncateForActivity(section.lyricsExcerpt ?? 'sem trecho', 220)}`
        }
      );
    }

    for (const [index, scene] of scenes.entries()) {
      const planningProgress = Math.min(89, 86 + Math.round(((index + 1) / scenes.length) * 3));
      await this.processingProgressService.heartbeat(
        project.id,
        planningProgress,
        `Cena ${index + 1} planejada: ${scene.title}.`,
        {
          stage: 'generating_scenes',
          message:
            `Cena ${index + 1}/${scenes.length} planejada: ${scene.title}. ` +
            `Base da letra: ${this.truncateForActivity(scene.lyricsExcerpt ?? 'sem trecho', 180)}. ` +
            `Descricao: ${this.truncateForActivity(scene.description, 260)}`
        }
      );
    }

    const scenePromptDrafts: ScenePromptDraft[] = [];

    for (const [index, scene] of scenes.entries()) {
      const promptProgress = Math.min(92, 87 + Math.round(((index + 1) / scenes.length) * 5));
      await this.processingProgressService.heartbeat(
        project.id,
        promptProgress,
        `Gerando prompt da cena ${index + 1} de ${scenes.length}: ${scene.title}.`,
        {
          stage: 'generating_scenes',
          message: `Gerando prompt da cena ${index + 1} de ${scenes.length}: ${scene.title}.`
        }
      );
      const generatedPromptDraft = await this.scenePromptGenerationService.build(scene, storyboard);
      const promptDraft = isDirectVideoProject
        ? {
            ...generatedPromptDraft,
            positivePrompt: project.generationPrompt!.trim()
          }
        : generatedPromptDraft;
      scenePromptDrafts.push(promptDraft);
      await this.processingProgressService.heartbeat(
        project.id,
        promptProgress,
        `Prompt da cena ${index + 1} pronto com provider ${promptDraft.provider}.`,
        {
          stage: 'generating_scenes',
          message: `Prompt da cena ${index + 1} pronto.`,
          provider: promptDraft.provider
        }
      );
    }

    await this.processingProgressService.heartbeat(
      project.id,
      93,
      'Prompts prontos. Persistindo cenas e configuracoes visuais no banco.',
      {
        stage: 'generating_scenes',
        message: 'Prompts prontos. Persistindo cenas no banco.'
      }
    );

    await this.prismaService.$transaction(async (tx) => {
      for (const [index, scene] of scenes.entries()) {
        const createdScene = await tx.scene.create({
          data: {
            projectId: project.id,
            musicSectionId: createdSections[scene.sectionIndex]?.id ?? null,
            index,
            title: scene.title,
            description: scene.description,
            startSeconds: scene.startSeconds,
            endSeconds: scene.endSeconds,
            durationSeconds: scene.durationSeconds,
            referenceImageAssetId: isImageProject ? project.sourceImageAssetId : null,
            status: SceneStatus.pending
          }
        });

        await tx.scenePrompt.create({
          data: {
            sceneId: createdScene.id,
            ...scenePromptDrafts[index]
          }
        });
      }
    });

    if (isDirectVideoProject) {
      const persistedScenes = await this.prismaService.scene.findMany({
        where: { projectId: project.id },
        include: {
          videoAsset: true,
          referenceImageAsset: true
        },
        orderBy: { index: 'asc' }
      });

      await this.projectPipelineStateService.update(
        project.id,
        ProjectStatus.rendering,
        95,
        'Cena planejada a partir da descricao. Iniciando a geracao do video.',
        {
          stage: 'rendering',
          message: 'Iniciando o render automatico do video descrito pelo usuario.'
        }
      );

      await this.projectRenderService.render({
        organizationId: payload.organizationId,
        projectId: project.id,
        generationMode: project.generationMode,
        audioPath: null,
        durationSeconds: effectiveDurationSeconds,
        visualCheckpointName: project.visualCheckpointName,
        stabilityTest: project.stabilityTest,
        wanOnly: project.wanOnly,
        generationSeed: project.generationSeed,
        generationCfg: project.generationCfg,
        generationSteps: project.generationSteps,
        generationFps: project.generationFps,
        scenes: persistedScenes.map((scene) => ({
          id: scene.id,
          title: scene.title,
          durationSeconds: scene.durationSeconds,
          sectionType:
            createdSections.find((section) => section.id === scene.musicSectionId)?.type ?? 'verse',
          status: scene.status,
          visualProvider: scene.visualProvider,
          videoAssetStoragePath: scene.videoAsset?.storagePath ?? null,
          referenceImageStoragePath: scene.referenceImageAsset?.storagePath ?? null,
          referenceImageAssetId: scene.referenceImageAsset?.id ?? null,
          referenceImageWidth: scene.referenceImageAsset?.width ?? null,
          referenceImageHeight: scene.referenceImageAsset?.height ?? null
        }))
      });

      return ProjectStatus.completed;
    }

    await this.projectPipelineStateService.update(
      project.id,
      ProjectStatus.awaiting_references,
      93,
      'Cenas e prompts prontos. Revise as cenas, adicione imagens de referencia se desejar e inicie a renderizacao.',
      {
        stage: 'awaiting_references',
        message:
          'Cenas e prompts persistidos. Pipeline pausado para revisao e imagens de referencia do usuario.'
      }
    );
    await this.processingProgressService.heartbeat(
      project.id,
      93,
      'Cenas salvas. Aguardando revisao do usuario antes de renderizar o MP4.',
      {
        stage: 'awaiting_references',
        message:
          'Aguardando o usuario adicionar imagens de referencia opcionais e iniciar a renderizacao.'
      }
    );

    return ProjectStatus.awaiting_references;
  }

  private truncateForActivity(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 3)}...`;
  }
}
