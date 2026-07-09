import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AssetType, Prisma, ProjectStatus } from '@prisma/client';
import { PROJECT_PROCESS_JOB_NAME, PROJECT_QUEUE_NAME } from '@video/shared';

import { PrismaService } from '../../../database/prisma.service';
import { ProjectProcessingPayloadFactory } from '../../jobs/services/project-processing-payload.factory';
import { ProjectProcessingQueueService } from '../../jobs/services/project-processing-queue.service';
import { LocalStorageService } from './local-storage.service';
import { ProjectPresenter } from './project.presenter';

interface CreateProjectInput {
  organizationId: string;
  createdByUserId: string;
  title: string;
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
    private readonly projectPresenter: ProjectPresenter
  ) {}

  async createProject(input: CreateProjectInput) {
    const clipDurationSeconds = this.normalizeClipDurationSeconds(input.clipDurationSeconds);
    const sceneDurationSeconds = this.normalizeSceneDurationSeconds(input.sceneDurationSeconds);
    const visualCheckpointName = this.normalizeVisualCheckpointName(input.visualCheckpointName);
    const manualLyrics = this.normalizeManualLyricsText(input.manualLyricsText);

    const project = await this.prismaService.project.create({
      data: {
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId,
        title: input.title.trim(),
        clipDurationSeconds,
        sceneDurationSeconds,
        visualCheckpointName,
        status: ProjectStatus.draft,
        ...(manualLyrics
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

    return this.projectPresenter.summaryWithLyrics(project);
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
        referenceImageAsset: true
      },
      orderBy: {
        index: 'asc'
      }
    });

    return scenes.map((scene) => this.projectPresenter.scene(scene));
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

    if (!project.track) {
      throw new BadRequestException('Project does not have an uploaded track');
    }

    if (project.status !== ProjectStatus.failed) {
      throw new BadRequestException('Only failed projects can be retried');
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
      preserveAudio: true,
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

    try {
      const queuedJob = await this.projectProcessingQueueService.enqueue(payload);

      await this.prismaService.$transaction([
        this.prismaService.processingJob.create({
          data: {
            projectId: input.projectId,
            queueName: PROJECT_QUEUE_NAME,
            jobName: PROJECT_PROCESS_JOB_NAME,
            bullJobId: queuedJob.bullJobId,
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

      await this.prismaService.project.update({
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
      });

      throw error;
    }
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
          ...(options.preserveAudio
            ? {
                type: {
                  in: removableAssetTypes
                }
              }
            : {})
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
        this.localStorageService.buildProjectRendersDirectory(organizationId, projectId)
      ),
      this.localStorageService.removePath(
        this.localStorageService.buildProjectTempDirectory(projectId)
      )
    ]);
  }

  private async getOwnedProject(projectId: string, organizationId: string, includeLyrics = false) {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      },
      ...(includeLyrics
        ? {
            include: {
              lyrics: true
            }
          }
        : {})
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
}
