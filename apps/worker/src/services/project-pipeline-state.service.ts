import { Inject, Injectable } from '@nestjs/common';
import { ProcessingJobStatus, ProjectStatus } from '@prisma/client';
import { PROJECT_PROCESS_JOB_NAME, PROJECT_QUEUE_NAME } from '@video/shared';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ProjectPipelineStateService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService
  ) {}

  async update(projectId: string, status: ProjectStatus, progress: number): Promise<void> {
    await this.prismaService.project.update({
      where: {
        id: projectId
      },
      data: {
        status,
        errorMessage: null
      }
    });

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

    if (!processingJob) {
      return;
    }

    await this.prismaService.processingJob.update({
      where: {
        id: processingJob.id
      },
      data: {
        status: ProcessingJobStatus.active,
        progress,
        errorMessage: null
      }
    });
  }
}
