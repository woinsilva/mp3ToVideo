import { Inject, Injectable } from '@nestjs/common';
import { ProjectStatus, ProcessingJobStatus } from '@prisma/client';
import {
  PROJECT_PROCESS_JOB_NAME,
  PROJECT_QUEUE_NAME,
  type ProjectProcessingJobPayload
} from '@video/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { ProjectProcessingPipelineService } from '../services/project-processing-pipeline.service';
import { ProcessingProgressService } from '../services/processing-progress.service';

@Injectable()
export class ProjectProcessor {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(ProcessingProgressService)
    private readonly processingProgressService: ProcessingProgressService,
    @Inject(ProjectProcessingPipelineService)
    private readonly pipelineService: ProjectProcessingPipelineService
  ) {}

  async process(job: Pick<Job<ProjectProcessingJobPayload>, 'id' | 'data'>): Promise<void> {
    const bullJobId = String(job.id);
    console.log(
      `[worker] starting project processing projectId=${job.data.projectId} bullJobId=${bullJobId}`
    );

    await this.upsertProcessingJob(job.data.projectId, bullJobId, ProcessingJobStatus.active, 10);
    await this.processingProgressService.heartbeat(job.data.projectId, 10);
    await this.updateProject(job.data.projectId, {
      status: ProjectStatus.processing,
      errorMessage: null
    });

    try {
      await this.pipelineService.run(job.data);

      await this.upsertProcessingJob(
        job.data.projectId,
        bullJobId,
        ProcessingJobStatus.completed,
        100
      );
      await this.updateProject(job.data.projectId, {
        status: ProjectStatus.completed,
        errorMessage: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown processing error';
      console.error(
        `[worker] project processing failed projectId=${job.data.projectId} bullJobId=${bullJobId}: ${message}`
      );

      await this.upsertProcessingJob(
        job.data.projectId,
        bullJobId,
        ProcessingJobStatus.failed,
        undefined,
        message
      );
      await this.updateProject(job.data.projectId, {
        status: ProjectStatus.failed,
        errorMessage: message
      });

      throw error;
    }

    console.log(
      `[worker] completed project processing projectId=${job.data.projectId} bullJobId=${bullJobId}`
    );
  }

  private async updateProject(
    projectId: string,
    data: { status: ProjectStatus; errorMessage: string | null }
  ): Promise<void> {
    await this.prismaService.project.update({
      where: {
        id: projectId
      },
      data
    });
  }

  private async upsertProcessingJob(
    projectId: string,
    bullJobId: string,
    status: ProcessingJobStatus,
    progress: number | undefined,
    errorMessage?: string
  ): Promise<void> {
    const existingJob = await this.prismaService.processingJob.findFirst({
      where: {
        projectId,
        queueName: PROJECT_QUEUE_NAME,
        jobName: PROJECT_PROCESS_JOB_NAME,
        bullJobId
      }
    });

    if (existingJob) {
      await this.prismaService.processingJob.update({
        where: {
          id: existingJob.id
        },
        data: {
          status,
          progress: progress ?? existingJob.progress,
          errorMessage: errorMessage ?? null
        }
      });

      return;
    }

    await this.prismaService.processingJob.create({
      data: {
        projectId,
        queueName: PROJECT_QUEUE_NAME,
        jobName: PROJECT_PROCESS_JOB_NAME,
        bullJobId,
        status,
        progress: progress ?? 0,
        errorMessage
      }
    });
  }
}
