import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
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

    return this.projectPresenter.uploadResult(
      input.projectId,
      result.id,
      ProjectStatus.uploaded
    );
  }
}
