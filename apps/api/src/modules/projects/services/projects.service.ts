import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
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
}

interface UploadTrackInput {
  organizationId: string;
  projectId: string;
  file: Express.Multer.File;
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
    const project = await this.prismaService.project.create({
      data: {
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId,
        title: input.title.trim(),
        status: ProjectStatus.draft
      }
    });

    return this.projectPresenter.summary(project);
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
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.projectPresenter.summary(project);
  }

  async uploadTrack(input: UploadTrackInput) {
    const project = await this.prismaService.project.findUnique({
      where: {
        id: input.projectId
      },
      include: {
        track: true
      }
    });

    if (!project || project.deletedAt) {
      throw new NotFoundException('Project not found');
    }

    if (project.organizationId !== input.organizationId) {
      throw new ForbiddenException('Project does not belong to the authenticated organization');
    }

    if (project.track) {
      throw new BadRequestException('Project already has an uploaded track');
    }

    const storagePath = await this.localStorageService.saveProjectTrack(
      input.organizationId,
      input.projectId,
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
          storagePath
        },
        create: {
          projectId: input.projectId,
          originalFileName: input.file.originalname,
          mimeType: input.file.mimetype,
          sizeBytes: input.file.size,
          storagePath
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
          status: ProjectStatus.uploaded
        }
      });

      return track;
    });

    const payload = this.projectProcessingPayloadFactory.build({
      projectId: input.projectId,
      organizationId: input.organizationId,
      requestedByUserId: project.createdByUserId
    });

    const queuedJob = await this.projectProcessingQueueService.enqueue(payload);

    await this.prismaService.$transaction([
      this.prismaService.processingJob.create({
        data: {
          projectId: input.projectId,
          queueName: PROJECT_QUEUE_NAME,
          jobName: PROJECT_PROCESS_JOB_NAME,
          bullJobId: queuedJob.bullJobId,
          status: 'queued',
          progress: 0
        }
      }),
      this.prismaService.project.update({
        where: {
          id: input.projectId
        },
        data: {
          status: ProjectStatus.queued,
          errorMessage: null
        }
      })
    ]);

    return this.projectPresenter.uploadResult(
      input.projectId,
      result.id,
      ProjectStatus.queued
    );
  }
}
