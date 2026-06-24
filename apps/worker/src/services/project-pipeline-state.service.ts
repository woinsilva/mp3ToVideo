import { Inject, Injectable } from '@nestjs/common';
import { ProcessingJobStatus, ProjectStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PROJECT_PROCESS_JOB_NAME, PROJECT_QUEUE_NAME } from '@video/shared';

import { PrismaService } from '../database/prisma.service';

interface ProcessingActivityInput {
  stage: string;
  message: string;
  provider?: string | null;
}

const ACTIVITY_LOG_LIMIT = 200;

@Injectable()
export class ProjectPipelineStateService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService
  ) {}

  async update(
    projectId: string,
    status: ProjectStatus,
    progress: number,
    detailMessage?: string,
    activity?: ProcessingActivityInput
  ): Promise<void> {
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
        detailMessage: detailMessage ?? processingJob.detailMessage,
        activityLog: this.nextActivityLog(processingJob.activityLog, activity, progress),
        errorMessage: null
      }
    });
  }

  private nextActivityLog(
    currentLog: Prisma.JsonValue | null | undefined,
    activity: ProcessingActivityInput | undefined,
    progress: number
  ): Prisma.InputJsonValue | undefined {
    if (!activity) {
      return undefined;
    }

    const entries = Array.isArray(currentLog) ? [...currentLog] : [];
    entries.push({
      ...activity,
      progress,
      timestamp: new Date().toISOString()
    });

    return entries.slice(-ACTIVITY_LOG_LIMIT) as Prisma.InputJsonValue;
  }
}
