import { Inject, Injectable } from '@nestjs/common';
import { ProcessingJobStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PROJECT_PROCESS_JOB_NAME, PROJECT_QUEUE_NAME } from '@video/shared';

import { PrismaService } from '../database/prisma.service';

interface ProcessingActivityInput {
  stage: string;
  message: string;
  provider?: string | null;
}

@Injectable()
export class ProcessingProgressService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService
  ) {}

  async heartbeat(
    projectId: string,
    progress?: number,
    detailMessage?: string,
    activity?: ProcessingActivityInput
  ): Promise<void> {
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
        progress: progress ?? processingJob.progress,
        detailMessage: detailMessage ?? processingJob.detailMessage,
        activityLog: this.nextActivityLog(
          processingJob.activityLog,
          activity,
          progress ?? processingJob.progress
        ),
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

    return entries.slice(-20) as Prisma.InputJsonValue;
  }
}
