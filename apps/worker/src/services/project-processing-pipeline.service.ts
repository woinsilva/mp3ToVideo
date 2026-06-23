import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectStatus, SceneStatus } from '@prisma/client';
import type { ProjectProcessingJobPayload } from '@video/shared';

import { PrismaService } from '../database/prisma.service';
import { AudioExcerptService } from './audio-excerpt.service';
import { AudioMetadataService } from './audio-metadata.service';
import { LyricsGenerationService } from './lyrics-generation.service';
import { MusicStructureService } from './music-structure.service';
import { ProjectPipelineStateService } from './project-pipeline-state.service';
import { ProjectRenderService } from './project-render.service';
import { ScenePlanningService } from './scene-planning.service';
import { ScenePromptGenerationService } from './scene-prompt-generation.service';
import { StoryboardGenerationService } from './storyboard-generation.service';

@Injectable()
export class ProjectProcessingPipelineService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(ProjectPipelineStateService)
    private readonly projectPipelineStateService: ProjectPipelineStateService,
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

  async run(payload: ProjectProcessingJobPayload): Promise<void> {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: payload.projectId,
        organizationId: payload.organizationId,
        deletedAt: null
      },
      include: {
        track: true,
        lyrics: true
      }
    });

    if (!project || !project.track) {
      throw new NotFoundException('Project track not found for processing');
    }

    await this.projectPipelineStateService.update(project.id, ProjectStatus.analyzing, 25);

    const sourceDurationSeconds = await this.audioMetadataService.resolveDurationSeconds(
      project.track.storagePath
    );
    await this.prismaService.track.update({
      where: {
        id: project.track.id
      },
      data: {
        durationSeconds: sourceDurationSeconds
      }
    });

    const requestedClipDurationSeconds = project.clipDurationSeconds
      ? Math.min(project.clipDurationSeconds, sourceDurationSeconds)
      : null;
    const effectiveDurationSeconds = requestedClipDurationSeconds ?? sourceDurationSeconds;
    const effectiveAudioPath = requestedClipDurationSeconds
      ? await this.audioExcerptService.buildInitialExcerpt(
          project.id,
          project.track.storagePath,
          effectiveDurationSeconds
        )
      : project.track.storagePath;

    const lyrics =
      project.lyrics ??
      (await this.prismaService.lyrics.create({
        data: {
          projectId: project.id,
          ...(await this.lyricsGenerationService.build(project.title, effectiveAudioPath))
        }
      }));

    const sections = this.musicStructureService.build(
      effectiveDurationSeconds,
      lyrics.normalizedText
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

    await this.projectPipelineStateService.update(project.id, ProjectStatus.storyboarding, 55);

    const storyboard = await this.storyboardGenerationService.build(
      project.title,
      lyrics.normalizedText
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

    await this.projectPipelineStateService.update(project.id, ProjectStatus.generating_scenes, 85);

    const scenes = this.scenePlanningService.build(
      effectiveDurationSeconds,
      sections,
      storyboard.narrativeSummary
    );

    await this.prismaService.$transaction(async (tx) => {
      for (const [index, scene] of scenes.entries()) {
        const promptDraft = await this.scenePromptGenerationService.build(scene, storyboard);
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
            status: SceneStatus.pending
          }
        });

        await tx.scenePrompt.create({
          data: {
            sceneId: createdScene.id,
            ...promptDraft
          }
        });
      }
    });

    const persistedScenes = await this.prismaService.scene.findMany({
      where: {
        projectId: project.id
      },
      orderBy: {
        index: 'asc'
      }
    });

    await this.projectPipelineStateService.update(project.id, ProjectStatus.rendering, 95);

    await this.projectRenderService.render({
      organizationId: payload.organizationId,
      projectId: project.id,
      audioPath: effectiveAudioPath,
      durationSeconds: effectiveDurationSeconds,
      scenes: persistedScenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        durationSeconds: scene.durationSeconds,
        sectionType:
          createdSections.find((section) => section.id === scene.musicSectionId)?.type ?? 'verse'
      }))
    });
  }
}
