import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetType, Prisma, ProjectStatus, SceneRenderAttemptStatus } from '@prisma/client';
import { PROJECT_PROCESS_JOB_NAME, PROJECT_QUEUE_NAME } from '@video/shared';
import { imageSize } from 'image-size';

import { PrismaService } from '../../../database/prisma.service';
import { ProjectProcessingPayloadFactory } from '../../jobs/services/project-processing-payload.factory';
import { ProjectProcessingQueueService } from '../../jobs/services/project-processing-queue.service';
import { LocalStorageService } from './local-storage.service';
import { ProjectPresenter } from './project.presenter';

interface CreateProjectInput {
  organizationId: string;
  createdByUserId: string;
  title: string;
  generationMode?: 'music' | 'prompt' | 'image';
  generationPrompt?: string;
  stabilityTest?: boolean;
  wanOnly?: boolean;
  generationSeed?: number;
  generationCfg?: number;
  generationSteps?: number;
  generationFps?: number;
  clipDurationSeconds?: number;
  sceneDurationSeconds?: number;
  visualCheckpointName?: string;
  manualLyricsText?: string;
}

interface UploadTrackInput {
  organizationId: string;
  projectId: string;
  clipDurationSeconds?: number;
  sceneDurationSeconds?: number;
  visualCheckpointName?: string;
  manualLyricsText?: string;
  file: Express.Multer.File;
}

interface RetryProjectInput {
  clipDurationSeconds?: number;
  sceneDurationSeconds?: number;
  visualCheckpointName?: string;
  manualLyricsText?: string;
}

interface ComfyUiPromptResponse {
  prompt_id?: string;
  error?: unknown;
  node_errors?: unknown;
}

interface ComfyUiOutputAsset {
  filename: string;
  subfolder?: string;
  type?: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(ProjectProcessingQueueService)
    private readonly projectProcessingQueueService: ProjectProcessingQueueService,
    @Inject(ProjectProcessingPayloadFactory)
    private readonly projectProcessingPayloadFactory: ProjectProcessingPayloadFactory,
    @Inject(LocalStorageService)
    private readonly localStorageService: LocalStorageService,
    @Inject(ProjectPresenter)
    private readonly projectPresenter: ProjectPresenter,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async createProject(input: CreateProjectInput) {
    const generationMode = input.generationMode ?? 'music';
    const generationPrompt = this.normalizeGenerationPrompt(input.generationPrompt);
    const clipDurationSeconds = this.normalizeClipDurationSeconds(input.clipDurationSeconds);
    const sceneDurationSeconds = this.normalizeSceneDurationSeconds(input.sceneDurationSeconds);
    const visualCheckpointName = this.normalizeVisualCheckpointName(input.visualCheckpointName);
    const manualLyrics = this.normalizeManualLyricsText(input.manualLyricsText);
    const isDirectVideoMode = generationMode === 'prompt' || generationMode === 'image';
    const generationFps = input.generationFps ?? 16;

    if (generationFps !== 16 && generationFps !== 24) {
      throw new BadRequestException('Generation FPS must be 16 or 24');
    }

    if (isDirectVideoMode && !generationPrompt) {
      throw new BadRequestException('A description is required for direct video generation');
    }

    if (isDirectVideoMode && clipDurationSeconds === null) {
      throw new BadRequestException('Video duration is required for direct video generation');
    }

    if (
      isDirectVideoMode &&
      clipDurationSeconds !== null &&
      ![2, 3, 5].includes(clipDurationSeconds)
    ) {
      throw new BadRequestException('Direct video duration must be 2, 3 or 5 seconds');
    }

    const project = await this.prismaService.project.create({
      data: {
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId,
        title: input.title.trim(),
        generationMode,
        generationPrompt,
        stabilityTest: isDirectVideoMode && Boolean(input.stabilityTest),
        wanOnly: isDirectVideoMode && input.wanOnly !== false,
        generationSeed: isDirectVideoMode ? input.generationSeed ?? null : null,
        generationCfg: isDirectVideoMode ? input.generationCfg ?? null : null,
        generationSteps: isDirectVideoMode ? input.generationSteps ?? null : null,
        generationFps,
        clipDurationSeconds,
        sceneDurationSeconds,
        visualCheckpointName,
        status: ProjectStatus.draft,
        ...(generationMode === 'music' && manualLyrics
          ? {
              lyrics: {
                create: {
                  source: 'manual',
                  ...manualLyrics
                }
              }
            }
          : {})
      },
      include: {
        lyrics: true
      }
    });

    if (generationMode === 'prompt') {
      await this.queueProjectProcessing({
        projectId: project.id,
        organizationId: input.organizationId,
        requestedByUserId: input.createdByUserId,
        clipDurationSeconds,
        sceneDurationSeconds,
        visualCheckpointName
      });

      return this.projectPresenter.summaryWithLyrics(
        await this.getOwnedProject(project.id, input.organizationId, true)
      );
    }

    return this.projectPresenter.summaryWithLyrics(project);
  }

  async uploadProjectSourceImage(
    projectId: string,
    organizationId: string,
    file: Express.Multer.File
  ) {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      },
      include: {
        sourceImageAsset: true
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.generationMode !== 'image') {
      throw new BadRequestException('Source image upload is only available for image-to-video projects');
    }

    if (project.status !== ProjectStatus.draft) {
      throw new BadRequestException('Source image can only be uploaded before image-to-video processing starts');
    }

    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(new Uint8Array(file.buffer));
    } catch {
      throw new BadRequestException('Uploaded file is not a valid JPEG, PNG or WebP image');
    }

    if (!dimensions.width || !dimensions.height) {
      throw new BadRequestException('Could not determine the uploaded image dimensions');
    }

    const storagePath = await this.localStorageService.saveProjectSourceImage(
      organizationId,
      projectId,
      file.originalname,
      file.buffer
    );
    const sourceImageAsset = await this.prismaService.asset.create({
      data: {
        organizationId,
        projectId,
        type: AssetType.source_image,
        mimeType: file.mimetype,
        storagePath,
        sizeBytes: file.size,
        width: dimensions.width,
        height: dimensions.height
      }
    });

    await this.prismaService.project.update({
      where: { id: projectId },
      data: { sourceImageAssetId: sourceImageAsset.id }
    });

    if (project.sourceImageAsset) {
      await this.localStorageService.removePath(project.sourceImageAsset.storagePath);
      await this.prismaService.asset.delete({ where: { id: project.sourceImageAsset.id } });
    }

    await this.queueProjectProcessing({
      projectId,
      organizationId,
      requestedByUserId: project.createdByUserId,
      clipDurationSeconds: project.clipDurationSeconds,
      sceneDurationSeconds: project.sceneDurationSeconds,
      visualCheckpointName: project.visualCheckpointName
    });

    return this.projectPresenter.summaryWithLyrics(
      await this.getOwnedProject(projectId, organizationId, true)
    );
  }

  async getProjectSourceImage(projectId: string, organizationId: string) {
    const project = await this.prismaService.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      include: { sourceImageAsset: true }
    });

    if (!project?.sourceImageAsset) {
      throw new NotFoundException('Project source image not found');
    }

    return {
      fileName: `source-${project.sourceImageAsset.id}`,
      absolutePath: this.localStorageService.getAbsolutePath(project.sourceImageAsset.storagePath),
      mimeType: project.sourceImageAsset.mimeType
    };
  }

  async listProjects(organizationId: string) {
    const projects = await this.prismaService.project.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return projects.map((project) => this.projectPresenter.summary(project));
  }

  async getProjectById(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId, true);

    return this.projectPresenter.summaryWithLyrics(project);
  }

  async getProjectStatus(projectId: string, organizationId: string) {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      },
      include: {
        lyrics: true,
        musicSections: {
          orderBy: {
            startSeconds: 'asc'
          }
        },
        scenes: {
          include: {
            renderAttempts: {
              orderBy: {
                attemptNumber: 'desc'
              }
            }
          },
          orderBy: {
            index: 'asc'
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const processingJob = await this.prismaService.processingJob.findFirst({
      where: {
        projectId,
        queueName: PROJECT_QUEUE_NAME,
        jobName: PROJECT_PROCESS_JOB_NAME
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return this.projectPresenter.status(project, processingJob);
  }

  async listProjectScenes(projectId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);

    const scenes = await this.prismaService.scene.findMany({
      where: {
        projectId
      },
      include: {
        prompt: true,
        referenceImageAsset: true,
        renderAttempts: {
          orderBy: {
            attemptNumber: 'desc'
          }
        }
      },
      orderBy: {
        index: 'asc'
      }
    });

    return scenes.map((scene) => this.projectPresenter.scene(scene));
  }

  async getVisualStoryboard(projectId: string, organizationId: string) {
    const storyboard = await this.prismaService.storyboard.findFirst({
      where: {
        projectId,
        project: {
          organizationId,
          deletedAt: null
        }
      },
      include: {
        visualAsset: true
      }
    });

    if (!storyboard) {
      throw new NotFoundException('Storyboard not found');
    }

    return {
      concept: storyboard.concept,
      visualStyle: storyboard.visualStyle,
      mood: storyboard.mood,
      colorPalette: storyboard.colorPalette,
      narrativeSummary: storyboard.narrativeSummary,
      visualPrompt: storyboard.visualPrompt,
      revisionInstruction: storyboard.revisionInstruction,
      hasImage: Boolean(storyboard.visualAsset),
      imageUrl: storyboard.visualAsset
        ? `/projects/${projectId}/visual-storyboard/image?updatedAt=${storyboard.visualAsset.updatedAt.getTime()}`
        : null,
      updatedAt: storyboard.updatedAt
    };
  }

  async getVisualStoryboardImage(projectId: string, organizationId: string) {
    const storyboard = await this.prismaService.storyboard.findFirst({
      where: {
        projectId,
        project: {
          organizationId,
          deletedAt: null
        }
      },
      include: {
        visualAsset: true
      }
    });

    if (!storyboard?.visualAsset) {
      throw new NotFoundException('Visual storyboard image not found');
    }

    return {
      fileName: `${projectId}-visual-storyboard.png`,
      absolutePath: this.localStorageService.getAbsolutePath(storyboard.visualAsset.storagePath),
      mimeType: storyboard.visualAsset.mimeType
    };
  }

  async regenerateVisualStoryboard(
    projectId: string,
    organizationId: string,
    instruction: string | null | undefined
  ) {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      },
      include: {
        storyboard: {
          include: {
            visualAsset: true
          }
        },
        scenes: {
          orderBy: {
            index: 'asc'
          },
          include: {
            prompt: true
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (!project.storyboard) {
      throw new BadRequestException('Project storyboard is not ready yet');
    }

    if (!project.scenes.length) {
      throw new BadRequestException('Project scenes are not ready yet');
    }

    await this.assertComfyUiAvailableForRender();

    const normalizedInstruction = instruction?.trim() || null;
    const visualPrompt = this.buildVisualStoryboardPrompt(project, normalizedInstruction);
    const imageBuffer = await this.generateComfyUiStoryboardImage(visualPrompt);
    const storagePath = await this.localStorageService.saveStoryboardImage(
      organizationId,
      projectId,
      imageBuffer
    );

    const previousAsset = project.storyboard.visualAsset;
    const asset = await this.prismaService.asset.create({
      data: {
        organizationId,
        projectId,
        type: AssetType.storyboard_image,
        mimeType: 'image/png',
        storagePath,
        sizeBytes: imageBuffer.length
      }
    });

    await this.prismaService.storyboard.update({
      where: {
        id: project.storyboard.id
      },
      data: {
        visualAssetId: asset.id,
        visualPrompt,
        revisionInstruction: normalizedInstruction
      }
    });

    if (previousAsset?.storagePath) {
      await this.localStorageService.removePath(previousAsset.storagePath);
      await this.prismaService.asset.delete({
        where: {
          id: previousAsset.id
        }
      });
    }

    return this.getVisualStoryboard(projectId, organizationId);
  }

  async retrySceneRender(projectId: string, sceneId: string, organizationId: string) {
    const scene = await this.prismaService.scene.findFirst({
      where: {
        id: sceneId,
        projectId,
        project: {
          organizationId,
          deletedAt: null
        }
      },
      include: {
        project: true,
        prompt: true,
        referenceImageAsset: true,
        renderAttempts: {
          orderBy: {
            attemptNumber: 'desc'
          }
        }
      }
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    if (scene.project.status !== ProjectStatus.rendering) {
      throw new BadRequestException('Scene render retry is only available while project is rendering');
    }

    const latestAttempt = scene.renderAttempts[0];

    if (!latestAttempt) {
      throw new BadRequestException('Scene does not have a render attempt to retry');
    }

    if (!this.isRetryableSceneRenderAttempt(latestAttempt.status)) {
      throw new ConflictException('Scene render attempt cannot be restarted in its current state');
    }

    await this.prismaService.sceneRenderAttempt.update({
      where: {
        id: latestAttempt.id
      },
      data: {
        status: SceneRenderAttemptStatus.abandoned,
        finishedAt: new Date(),
        errorMessage: 'Render attempt restarted by user'
      }
    });

    return this.projectPresenter.scene(
      await this.prismaService.scene.findUniqueOrThrow({
        where: {
          id: scene.id
        },
        include: {
          prompt: true,
          referenceImageAsset: true,
          renderAttempts: {
            orderBy: {
              attemptNumber: 'desc'
            }
          }
        }
      })
    );
  }

  async uploadSceneReferenceImage(
    projectId: string,
    sceneId: string,
    organizationId: string,
    file: Express.Multer.File
  ) {
    const scene = await this.prismaService.scene.findFirst({
      where: {
        id: sceneId,
        projectId,
        project: {
          organizationId,
          deletedAt: null
        }
      },
      include: {
        referenceImageAsset: true
      }
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    if (scene.referenceImageAsset?.storagePath) {
      await this.localStorageService.removePath(scene.referenceImageAsset.storagePath);
      await this.prismaService.asset.delete({
        where: {
          id: scene.referenceImageAsset.id
        }
      });
    }

    const storagePath = await this.localStorageService.saveSceneReferenceImage(
      organizationId,
      projectId,
      scene.index,
      file.originalname,
      file.buffer
    );

    const referenceImageAsset = await this.prismaService.asset.create({
      data: {
        organizationId,
        projectId,
        type: AssetType.image,
        mimeType: file.mimetype,
        storagePath,
        sizeBytes: file.size
      }
    });

    const updatedScene = await this.prismaService.scene.update({
      where: {
        id: sceneId
      },
      data: {
        referenceImageAssetId: referenceImageAsset.id
      },
      include: {
        prompt: true,
        referenceImageAsset: true
      }
    });

    return this.projectPresenter.scene(updatedScene);
  }

  async getSceneReferenceImage(
    projectId: string,
    sceneId: string,
    organizationId: string
  ) {
    const scene = await this.prismaService.scene.findFirst({
      where: {
        id: sceneId,
        projectId,
        project: {
          organizationId,
          deletedAt: null
        }
      },
      include: {
        referenceImageAsset: true
      }
    });

    if (!scene?.referenceImageAsset) {
      throw new NotFoundException('Scene reference image not found');
    }

    return {
      fileName: `${sceneId}-${scene.referenceImageAsset.id}`,
      absolutePath: this.localStorageService.getAbsolutePath(scene.referenceImageAsset.storagePath),
      mimeType: scene.referenceImageAsset.mimeType
    };
  }

  async getProjectRender(projectId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);

    const render = await this.prismaService.render.findFirst({
      where: {
        projectId
      },
      include: {
        asset: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!render || !render.asset) {
      throw new NotFoundException('Render not found');
    }

    return this.projectPresenter.render(render);
  }

  async getProjectDownload(projectId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);

    const render = await this.prismaService.render.findFirst({
      where: {
        projectId
      },
      include: {
        asset: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!render || render.status !== 'completed' || !render.asset) {
      throw new NotFoundException('Rendered video not found');
    }

    return {
      fileName: `${projectId}.mp4`,
      absolutePath: this.localStorageService.getAbsolutePath(render.asset.storagePath),
      mimeType: render.asset.mimeType
    };
  }

  async uploadTrack(input: UploadTrackInput) {
    const clipDurationSeconds = this.normalizeClipDurationSeconds(input.clipDurationSeconds);
    const sceneDurationSeconds = this.normalizeSceneDurationSeconds(input.sceneDurationSeconds);
    const visualCheckpointName = this.normalizeVisualCheckpointName(input.visualCheckpointName);
    const project = await this.prismaService.project.findUnique({
      where: {
        id: input.projectId
      },
      include: {
        track: true,
        lyrics: true
      }
    });

    if (!project || project.deletedAt) {
      throw new NotFoundException('Project not found');
    }

    if (project.organizationId !== input.organizationId) {
      throw new ForbiddenException('Project does not belong to the authenticated organization');
    }

    if (project.generationMode !== 'music') {
      throw new BadRequestException('Only music-based projects accept an audio track');
    }

    if (project.track && project.status !== ProjectStatus.failed) {
      throw new BadRequestException('Project already has an uploaded track');
    }

    if (project.status !== ProjectStatus.draft && project.status !== ProjectStatus.failed) {
      throw new BadRequestException('Track upload is only allowed for draft or failed projects');
    }

    const manualLyrics =
      this.normalizeManualLyricsText(input.manualLyricsText) ??
      (project.lyrics?.source === 'manual'
        ? {
            rawText: project.lyrics.rawText,
            normalizedText: project.lyrics.normalizedText
          }
        : null);

    if (project.track && project.status === ProjectStatus.failed) {
      await this.localStorageService.removePath(
        this.localStorageService.buildProjectUploadDirectory(input.organizationId, input.projectId)
      );
    }

    const storagePath = await this.localStorageService.saveProjectTrack(
      input.organizationId,
      input.projectId,
      input.file.originalname,
      input.file.buffer
    );

    const result = await this.prismaService.$transaction(async (tx) => {
      const track = await tx.track.upsert({
        where: {
          projectId: input.projectId
        },
        update: {
          originalFileName: input.file.originalname,
          mimeType: input.file.mimetype,
          sizeBytes: input.file.size,
          storagePath,
          durationSeconds: null
        },
        create: {
          projectId: input.projectId,
          originalFileName: input.file.originalname,
          mimeType: input.file.mimetype,
          sizeBytes: input.file.size,
          storagePath
        }
      });

      await tx.asset.deleteMany({
        where: {
          projectId: input.projectId,
          organizationId: input.organizationId,
          type: AssetType.audio
        }
      });

      await tx.asset.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          type: 'audio',
          mimeType: input.file.mimetype,
          storagePath,
          sizeBytes: input.file.size
        }
      });

      await tx.project.update({
        where: {
          id: input.projectId
        },
        data: {
          clipDurationSeconds:
            clipDurationSeconds !== null ? clipDurationSeconds : project.clipDurationSeconds,
          sceneDurationSeconds:
            sceneDurationSeconds !== null ? sceneDurationSeconds : project.sceneDurationSeconds,
          visualCheckpointName:
            visualCheckpointName !== null ? visualCheckpointName : project.visualCheckpointName,
          status: ProjectStatus.uploaded
        }
      });

      return track;
    });

    await this.resetDerivedProjectState(input.projectId, input.organizationId, {
      preserveAudio: true,
      preserveManualLyrics: false
    });

    if (manualLyrics) {
      await this.prismaService.lyrics.upsert({
        where: {
          projectId: input.projectId
        },
        update: {
          source: 'manual',
          ...manualLyrics
        },
        create: {
          projectId: input.projectId,
          source: 'manual',
          ...manualLyrics
        }
      });
    }

    await this.queueProjectProcessing({
      projectId: input.projectId,
      organizationId: input.organizationId,
      requestedByUserId: project.createdByUserId,
      clipDurationSeconds:
        clipDurationSeconds !== null ? clipDurationSeconds : project.clipDurationSeconds,
      sceneDurationSeconds:
        sceneDurationSeconds !== null ? sceneDurationSeconds : project.sceneDurationSeconds,
      visualCheckpointName:
        visualCheckpointName !== null ? visualCheckpointName : project.visualCheckpointName
    });

    return this.projectPresenter.uploadResult(
      input.projectId,
      result.id,
      ProjectStatus.queued
    );
  }

  async retryProject(
    projectId: string,
    organizationId: string,
    input: RetryProjectInput = {}
  ) {
    const clipDurationSeconds = this.normalizeClipDurationSeconds(input.clipDurationSeconds);
    const sceneDurationSeconds = this.normalizeSceneDurationSeconds(input.sceneDurationSeconds);
    const visualCheckpointName = this.normalizeVisualCheckpointName(input.visualCheckpointName);
    const project = await this.prismaService.project.findUnique({
      where: {
        id: projectId
      },
      include: {
        track: true,
        lyrics: true
      }
    });

    if (!project || project.deletedAt) {
      throw new NotFoundException('Project not found');
    }

    if (project.organizationId !== organizationId) {
      throw new ForbiddenException('Project does not belong to the authenticated organization');
    }

    if (!project.track && project.generationMode !== 'prompt' && project.generationMode !== 'image') {
      throw new BadRequestException('Project does not have an uploaded track');
    }

    if (project.generationMode === 'image' && !project.sourceImageAssetId) {
      throw new BadRequestException('Image-to-video project does not have a source image');
    }

    if (project.status !== ProjectStatus.failed && project.status !== ProjectStatus.completed) {
      throw new BadRequestException('Only failed or completed projects can be retried');
    }

    const providedManualLyrics = this.normalizeManualLyricsText(input.manualLyricsText);
    const manualLyrics =
      providedManualLyrics ??
      (project.lyrics?.source === 'manual'
        ? {
            rawText: project.lyrics.rawText,
            normalizedText: project.lyrics.normalizedText
          }
        : null);
    const currentManualLyrics =
      project.lyrics?.source === 'manual'
        ? {
            rawText: project.lyrics.rawText,
            normalizedText: project.lyrics.normalizedText
          }
        : null;
    const nextClipDurationSeconds =
      clipDurationSeconds !== null ? clipDurationSeconds : project.clipDurationSeconds;
    const nextSceneDurationSeconds =
      sceneDurationSeconds !== null ? sceneDurationSeconds : project.sceneDurationSeconds;
    const nextVisualCheckpointName =
      visualCheckpointName !== null ? visualCheckpointName : project.visualCheckpointName;
    const shouldPreserveGeneratedState =
      nextClipDurationSeconds === project.clipDurationSeconds &&
      nextSceneDurationSeconds === project.sceneDurationSeconds &&
      nextVisualCheckpointName === project.visualCheckpointName &&
      JSON.stringify(manualLyrics) === JSON.stringify(currentManualLyrics);

    await this.resetDerivedProjectState(projectId, organizationId, {
      preserveAudio: Boolean(project.track),
      preserveManualLyrics: false,
      preserveGeneratedState: shouldPreserveGeneratedState
    });

    if (manualLyrics) {
      await this.prismaService.lyrics.upsert({
        where: {
          projectId
        },
        update: {
          source: 'manual',
          ...manualLyrics
        },
        create: {
          projectId,
          source: 'manual',
          ...manualLyrics
        }
      });
    }

    await this.queueProjectProcessing({
      projectId,
      organizationId,
      requestedByUserId: project.createdByUserId,
      clipDurationSeconds: nextClipDurationSeconds,
      sceneDurationSeconds: nextSceneDurationSeconds,
      visualCheckpointName: nextVisualCheckpointName
    });

    return this.projectPresenter.summaryWithLyrics(
      await this.getOwnedProject(projectId, organizationId, true)
    );
  }

  async startProjectRender(projectId: string, organizationId: string) {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      },
      include: {
        track: true,
        scenes: {
          include: {
            prompt: true
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (!project.track && project.generationMode !== 'prompt' && project.generationMode !== 'image') {
      throw new BadRequestException('Project does not have an uploaded track');
    }

    if (project.status !== ProjectStatus.awaiting_references) {
      throw new BadRequestException('Project is not waiting for scene references');
    }

    if (!project.scenes.length || project.scenes.some((scene) => !scene.prompt)) {
      throw new BadRequestException('Project scenes are not ready for rendering');
    }

    await this.assertComfyUiAvailableForRender();

    await this.queueProjectProcessing({
      projectId,
      organizationId,
      requestedByUserId: project.createdByUserId,
      clipDurationSeconds: project.clipDurationSeconds,
      sceneDurationSeconds: project.sceneDurationSeconds,
      visualCheckpointName: project.visualCheckpointName
    });

    return this.projectPresenter.summaryWithLyrics(
      await this.getOwnedProject(projectId, organizationId, true)
    );
  }

  private async queueProjectProcessing(input: {
    projectId: string;
    organizationId: string;
    requestedByUserId: string;
    clipDurationSeconds?: number | null;
    sceneDurationSeconds?: number | null;
    visualCheckpointName?: string | null;
  }) {
    const payload = this.projectProcessingPayloadFactory.build({
      projectId: input.projectId,
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId
    });

    const processingJob = await this.prismaService.processingJob.create({
      data: {
        projectId: input.projectId,
        queueName: PROJECT_QUEUE_NAME,
        jobName: PROJECT_PROCESS_JOB_NAME,
        status: 'queued',
        progress: 0,
        detailMessage: 'Projeto enfileirado. Aguardando worker iniciar o pipeline.',
        activityLog: [
          {
            stage: 'queued',
            message: 'Projeto enfileirado e aguardando inicio do worker.',
            provider: null,
            progress: 0,
            timestamp: new Date().toISOString()
          }
        ] satisfies Prisma.InputJsonValue,
        errorMessage: null
      }
    });

    try {
      const queuedJob = await this.projectProcessingQueueService.enqueue(payload, {
        jobId: processingJob.id
      });

      await this.prismaService.$transaction([
        this.prismaService.processingJob.update({
          where: {
            id: processingJob.id
          },
          data: {
            bullJobId: queuedJob.bullJobId
          }
        }),
        this.prismaService.project.update({
          where: {
            id: input.projectId
          },
          data: {
            clipDurationSeconds: input.clipDurationSeconds ?? null,
            sceneDurationSeconds: input.sceneDurationSeconds ?? null,
            visualCheckpointName: input.visualCheckpointName ?? null,
            status: ProjectStatus.queued,
            errorMessage: null
          }
        })
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue error';

      await this.prismaService.$transaction([
        this.prismaService.processingJob.update({
          where: {
            id: processingJob.id
          },
          data: {
            status: 'failed',
            errorMessage: `Failed to enqueue project processing: ${message}`,
            detailMessage: `Falha ao enfileirar projeto: ${message}`
          }
        }),
        this.prismaService.project.update({
          where: {
            id: input.projectId
          },
          data: {
            clipDurationSeconds: input.clipDurationSeconds ?? null,
            sceneDurationSeconds: input.sceneDurationSeconds ?? null,
            visualCheckpointName: input.visualCheckpointName ?? null,
            status: ProjectStatus.failed,
            errorMessage: `Failed to enqueue project processing: ${message}`
          }
        })
      ]);

      throw error;
    }
  }

  private async assertComfyUiAvailableForRender(): Promise<void> {
    if (this.configService.get<string>('visual.provider', 'procedural') !== 'comfyui') {
      return;
    }

    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const timeoutMs = this.configService.get<number>('visual.comfyuiHealthTimeoutMs', 5000);

    try {
      const response = await fetch(`${baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new BadRequestException(
        `ComfyUI nao esta acessivel em ${baseUrl}. Inicie o ComfyUI e tente iniciar o render novamente. Detalhe: ${reason}`
      );
    }
  }

  private buildVisualStoryboardPrompt(
    project: {
      title: string;
      storyboard: {
        concept: string;
        visualStyle: string;
        mood: string;
        colorPalette: string;
        narrativeSummary: string;
      } | null;
      scenes: Array<{
        index: number;
        title: string;
        description: string;
        prompt: {
          positivePrompt: string;
          style: string;
          camera: string;
        } | null;
      }>;
    },
    instruction: string | null
  ): string {
    const sceneList = project.scenes
      .map((scene) => {
        const prompt = scene.prompt;
        return [
          `Panel ${scene.index + 1}: ${scene.title}.`,
          scene.description,
          prompt ? `Camera: ${prompt.camera}. Style: ${prompt.style}.` : ''
        ]
          .filter(Boolean)
          .join(' ');
      })
      .join('\n');

    return [
      'Create a cinematic music-video storyboard contact sheet.',
      'Single coherent protagonist across all panels, consistent outfit and face.',
      'Grid layout, black gutters between panels, premium photorealistic advertising look.',
      'Use the contact sheet only as visual direction, not as a final video frame.',
      'Avoid distorted hands, avoid close-up fingers, avoid drinking actions touching the mouth.',
      `Project title: ${project.title}.`,
      project.storyboard ? `Concept: ${project.storyboard.concept}.` : '',
      project.storyboard ? `Visual style: ${project.storyboard.visualStyle}.` : '',
      project.storyboard ? `Mood: ${project.storyboard.mood}.` : '',
      project.storyboard ? `Color palette: ${project.storyboard.colorPalette}.` : '',
      project.storyboard ? `Narrative: ${project.storyboard.narrativeSummary}.` : '',
      instruction ? `User requested changes: ${instruction}.` : '',
      'Panels:',
      sceneList
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async generateComfyUiStoryboardImage(promptText: string): Promise<Buffer> {
    const checkpointName = this.configService
      .get<string>('visual.comfyuiCheckpointName', '')
      .trim();

    if (!checkpointName) {
      throw new BadRequestException(
        'COMFYUI_CHECKPOINT_NAME nao esta configurado. Configure um checkpoint de imagem no ComfyUI para gerar storyboard visual.'
      );
    }

    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const width = this.configService.get<number>('visual.comfyuiStoryboardWidth', 1536);
    const height = this.configService.get<number>('visual.comfyuiStoryboardHeight', 864);
    const steps = this.configService.get<number>('visual.comfyuiStoryboardSteps', 24);
    const cfg = this.configService.get<number>('visual.comfyuiStoryboardCfg', 5);
    const sampler = this.configService.get<string>('visual.comfyuiStoryboardSampler', 'uni_pc');
    const scheduler = this.configService.get<string>('visual.comfyuiStoryboardScheduler', 'simple');

    const workflow = {
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: checkpointName
        }
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width,
          height,
          batch_size: 1
        }
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: promptText,
          clip: ['4', 1]
        }
      },
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text:
            'low quality, blurry, deformed hands, extra fingers, broken anatomy, distorted face, bad text, watermark, logo, duplicate face',
          clip: ['4', 1]
        }
      },
      '3': {
        class_type: 'KSampler',
        inputs: {
          seed: Math.floor(Math.random() * 2_147_483_647),
          steps,
          cfg,
          sampler_name: sampler,
          scheduler,
          denoise: 1,
          model: ['4', 0],
          positive: ['6', 0],
          negative: ['7', 0],
          latent_image: ['5', 0]
        }
      },
      '8': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['3', 0],
          vae: ['4', 2]
        }
      },
      '9': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: `video-saas/storyboard-${Date.now()}`,
          images: ['8', 0]
        }
      }
    };

    const promptResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: workflow
      })
    });

    if (!promptResponse.ok) {
      throw new BadRequestException(
        `ComfyUI recusou o workflow de storyboard: ${await promptResponse.text()}`
      );
    }

    const promptPayload = (await promptResponse.json()) as ComfyUiPromptResponse;
    const promptId = promptPayload.prompt_id?.trim();

    if (!promptId) {
      throw new BadRequestException(
        `ComfyUI nao retornou prompt_id para o storyboard: ${JSON.stringify(promptPayload)}`
      );
    }

    const image = await this.waitForComfyUiImage(promptId, baseUrl);
    const query = new URLSearchParams({
      filename: image.filename,
      type: image.type ?? 'output'
    });

    if (image.subfolder) {
      query.set('subfolder', image.subfolder);
    }

    const imageResponse = await fetch(`${baseUrl}/view?${query.toString()}`);

    if (!imageResponse.ok) {
      throw new BadRequestException(
        `ComfyUI gerou o storyboard, mas a imagem nao pode ser baixada: status ${imageResponse.status}`
      );
    }

    return Buffer.from(await imageResponse.arrayBuffer());
  }

  private async waitForComfyUiImage(
    promptId: string,
    baseUrl: string
  ): Promise<ComfyUiOutputAsset> {
    const timeoutAt = Date.now() + 5 * 60_000;

    while (Date.now() < timeoutAt) {
      const response = await fetch(`${baseUrl}/history/${promptId}`);

      if (response.ok) {
        const payload = (await response.json()) as Record<string, { outputs?: Record<string, unknown> }>;
        const entry = payload[promptId];
        const image = this.extractComfyUiImage(entry?.outputs);

        if (image) {
          return image;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new BadRequestException('ComfyUI demorou demais para gerar o storyboard visual.');
  }

  private extractComfyUiImage(outputs: Record<string, unknown> | undefined): ComfyUiOutputAsset | null {
    if (!outputs) {
      return null;
    }

    for (const output of Object.values(outputs)) {
      if (!output || typeof output !== 'object') {
        continue;
      }

      const images = (output as { images?: unknown }).images;

      if (!Array.isArray(images) || !images.length) {
        continue;
      }

      const image = images[0] as Partial<ComfyUiOutputAsset>;

      if (typeof image.filename === 'string') {
        return {
          filename: image.filename,
          subfolder: typeof image.subfolder === 'string' ? image.subfolder : undefined,
          type: typeof image.type === 'string' ? image.type : undefined
        };
      }
    }

    return null;
  }

  private async resetDerivedProjectState(
    projectId: string,
    organizationId: string,
    options: {
      preserveAudio: boolean;
      preserveManualLyrics: boolean;
      preserveGeneratedState?: boolean;
    }
  ) {
    if (options.preserveGeneratedState) {
      await this.prismaService.$transaction(async (tx) => {
        await tx.render.deleteMany({
          where: {
            projectId
          }
        });

        await tx.asset.deleteMany({
          where: {
            projectId,
            organizationId,
            type: AssetType.render
          }
        });
      });

      await Promise.all([
        this.localStorageService.removePath(
          this.localStorageService.buildProjectRendersDirectory(organizationId, projectId)
        ),
        this.localStorageService.removePath(
          this.localStorageService.buildProjectContinuityFramesDirectory(organizationId, projectId)
        ),
        this.localStorageService.removePath(
          this.localStorageService.buildProjectStoryboardImagesDirectory(organizationId, projectId)
        ),
        this.localStorageService.removePath(
          this.localStorageService.buildProjectTempDirectory(projectId)
        )
      ]);

      return;
    }

    const removableAssetTypes = [
      AssetType.image,
      AssetType.video_scene,
      AssetType.render,
      AssetType.subtitle,
      AssetType.temp
    ];

    await this.prismaService.$transaction(async (tx) => {
      await tx.render.deleteMany({
        where: {
          projectId
        }
      });

      await tx.scene.deleteMany({
        where: {
          projectId
        }
      });

      await tx.musicSection.deleteMany({
        where: {
          projectId
        }
      });

      await tx.storyboard.deleteMany({
        where: {
          projectId
        }
      });

      if (options.preserveManualLyrics) {
        await tx.lyrics.deleteMany({
          where: {
            projectId,
            source: {
              not: 'manual'
            }
          }
        });
      } else {
        await tx.lyrics.deleteMany({
          where: {
            projectId
          }
        });
      }

      await tx.asset.deleteMany({
        where: {
          projectId,
          organizationId,
          type: {
            in: options.preserveAudio
              ? removableAssetTypes
              : [...removableAssetTypes, AssetType.audio]
          }
        }
      });
    });

    await Promise.all([
      this.localStorageService.removePath(
        this.localStorageService.buildProjectGeneratedScenesDirectory(organizationId, projectId)
      ),
      this.localStorageService.removePath(
        this.localStorageService.buildProjectSceneReferenceImagesDirectory(organizationId, projectId)
      ),
      this.localStorageService.removePath(
        this.localStorageService.buildProjectGeneratedImagesDirectory(organizationId, projectId)
      ),
      this.localStorageService.removePath(
        this.localStorageService.buildProjectContinuityFramesDirectory(organizationId, projectId)
      ),
      this.localStorageService.removePath(
        this.localStorageService.buildProjectStoryboardImagesDirectory(organizationId, projectId)
      ),
      this.localStorageService.removePath(
        this.localStorageService.buildProjectRendersDirectory(organizationId, projectId)
      ),
      this.localStorageService.removePath(
        this.localStorageService.buildProjectTempDirectory(projectId)
      )
    ]);
  }

  private async getOwnedProject(projectId: string, organizationId: string, includeLyrics = false) {
    void includeLyrics;
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      },
      include: {
        lyrics: true,
        sourceImageAsset: true
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private normalizeManualLyricsText(value: string | null | undefined): {
    rawText: string;
    normalizedText: string;
  } | null {
    const rawText = value?.trim();

    if (!rawText) {
      return null;
    }

    return {
      rawText,
      normalizedText: rawText.replace(/\s+/g, ' ').trim().toLowerCase()
    };
  }

  private normalizeGenerationPrompt(value: string | null | undefined): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private normalizeClipDurationSeconds(value: number | string | null | undefined): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const normalizedValue = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(normalizedValue)) {
      throw new BadRequestException('Clip duration must be a valid number');
    }

    if (normalizedValue < 1 || normalizedValue > 600) {
      throw new BadRequestException('Clip duration must be between 1 and 600 seconds');
    }

    return normalizedValue;
  }

  private normalizeSceneDurationSeconds(value: number | string | null | undefined): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const normalizedValue = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(normalizedValue)) {
      throw new BadRequestException('Scene duration must be a valid number');
    }

    if (normalizedValue < 3 || normalizedValue > 30) {
      throw new BadRequestException('Scene duration must be between 3 and 30 seconds');
    }

    return normalizedValue;
  }

  private normalizeVisualCheckpointName(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private isRetryableSceneRenderAttempt(status: SceneRenderAttemptStatus): boolean {
    return (
      status === SceneRenderAttemptStatus.queued ||
      status === SceneRenderAttemptStatus.submitted ||
      status === SceneRenderAttemptStatus.waiting_external ||
      status === SceneRenderAttemptStatus.confirmed_external_active ||
      status === SceneRenderAttemptStatus.failed
    );
  }
}
