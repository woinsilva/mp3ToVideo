import { Inject, Injectable } from '@nestjs/common';
import { ProjectStatus, ProcessingJobStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  PROJECT_PROCESS_JOB_NAME,
  PROJECT_QUEUE_NAME,
  type ProjectProcessingJobPayload
} from '@video/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { ProjectProcessingPipelineService } from '../services/project-processing-pipeline.service';
import { ProcessingProgressService } from '../services/processing-progress.service';
import { FrameInterpolationSchedulerService } from '../services/frame-interpolation-scheduler.service';

interface ProcessingActivityInput {
  stage: string;
  message: string;
  provider?: string | null;
}

const ACTIVITY_LOG_LIMIT = 200;

@Injectable()
export class ProjectProcessor {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(ProcessingProgressService)
    private readonly processingProgressService: ProcessingProgressService,
    @Inject(ProjectProcessingPipelineService)
    private readonly pipelineService: ProjectProcessingPipelineService,
    @Inject(FrameInterpolationSchedulerService)
    private readonly interpolationScheduler: FrameInterpolationSchedulerService
  ) {}

  async process(job: Pick<Job<ProjectProcessingJobPayload>, 'id' | 'data'>): Promise<void> {
    const bullJobId = String(job.id);
    console.log(
      `[worker] starting project processing projectId=${job.data.projectId} bullJobId=${bullJobId}`
    );

    await this.upsertProcessingJob(
      job.data.projectId,
      bullJobId,
      ProcessingJobStatus.active,
      10,
      null,
      'Worker iniciado. Preparando pipeline do projeto.',
      {
        stage: 'processing',
        message: 'Worker iniciou o pipeline e esta preparando o processamento.'
      }
    );
    await this.processingProgressService.heartbeat(
      job.data.projectId,
      10,
      'Worker iniciado. Preparando pipeline do projeto.'
    );
    await this.updateProject(job.data.projectId, {
      status: ProjectStatus.processing,
      errorMessage: null
    });

    try {
      const pipelineResultStatus = await this.pipelineService.run(job.data);

      if (pipelineResultStatus === ProjectStatus.awaiting_references) {
        await this.upsertProcessingJob(
          job.data.projectId,
          bullJobId,
          ProcessingJobStatus.completed,
          93,
          null,
          'Cenas prontas. Aguardando revisao e imagens de referencia antes do render.',
          {
            stage: 'awaiting_references',
            message:
              'Cenas e prompts prontos. O usuario pode revisar, adicionar referencias e iniciar o render.'
          }
        );
        await this.updateProject(job.data.projectId, {
          status: ProjectStatus.awaiting_references,
          errorMessage: null
        });
        console.log(
          `[worker] paused project processing for references projectId=${job.data.projectId} bullJobId=${bullJobId}`
        );
        return;
      }

      await this.upsertProcessingJob(
        job.data.projectId,
        bullJobId,
        ProcessingJobStatus.completed,
        100,
        null,
        'Pipeline concluido. O videoclipe final esta pronto para download.',
        {
          stage: 'completed',
          message: 'Pipeline concluido com sucesso. O MP4 final foi gerado.'
        }
      );
      await this.updateProject(job.data.projectId, {
        status: ProjectStatus.completed,
        errorMessage: null
      });
      try {
        await this.interpolationScheduler?.scheduleIfEnabled(job.data.projectId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown interpolation scheduling error';
        console.error(`[worker] original render completed, but RIFE scheduling failed projectId=${job.data.projectId}: ${message}`);
      }
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
        message,
        `Falha no pipeline: ${message}`,
        {
          stage: 'failed',
          message: `Falha no pipeline: ${message}`
        }
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
    errorMessage?: string | null,
    detailMessage?: string | null,
    activity?: ProcessingActivityInput
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
          detailMessage: detailMessage ?? existingJob.detailMessage,
          activityLog: this.nextActivityLog(
            existingJob.activityLog,
            activity,
            progress ?? existingJob.progress
          ),
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
        detailMessage: detailMessage ?? null,
        activityLog: activity
          ? [
              {
                ...activity,
                progress: progress ?? 0,
                timestamp: new Date().toISOString()
              }
            ]
          : undefined,
        errorMessage
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
