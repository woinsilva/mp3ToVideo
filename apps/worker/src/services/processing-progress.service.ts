import { Inject, Injectable } from '@nestjs/common';
import { ProcessingJobStatus } from '@prisma/client';
import { PROJECT_PROCESS_JOB_NAME, PROJECT_QUEUE_NAME } from '@video/shared';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ProcessingProgressService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService
  ) {}

  async heartbeat(projectId: string, progress?: number): Promise<void> {
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
        errorMessage: null
      }
    });
  }
}
