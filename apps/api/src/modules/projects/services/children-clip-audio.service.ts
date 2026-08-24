import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ChildrenClipAudioAnalysisStatus, ProcessingJobStatus } from '@prisma/client';
import {
  CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME,
  CHILDREN_CLIP_QUEUE_NAME
} from '@video/shared';

import { PrismaService } from '../../../database/prisma.service';
import { ChildrenClipQueueService } from '../../jobs/services/children-clip-queue.service';

@Injectable()
export class ChildrenClipAudioService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService
  ) {}

  async get(projectId: string, organizationId: string) {
    await this.getOwnedProject(projectId, organizationId);
    const [analysis, lyricCues, musicSections, processingJob] = await Promise.all([
      this.prisma.childrenClipAudioAnalysis.findUnique({ where: { projectId } }),
      this.prisma.childrenClipLyricCue.findMany({ where: { projectId }, orderBy: { lineIndex: 'asc' } }),
      this.prisma.musicSection.findMany({ where: { projectId }, orderBy: { startSeconds: 'asc' } }),
      this.prisma.processingJob.findFirst({
        where: { projectId, jobName: CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      analysis,
      lyricCues,
      musicSections,
      job: processingJob
        ? {
            id: processingJob.id,
            status: processingJob.status,
            progress: processingJob.progress,
            detailMessage: processingJob.detailMessage,
            errorMessage: processingJob.errorMessage,
            activityLog: processingJob.activityLog
          }
        : null
    };
  }

  async enqueue(projectId: string, organizationId: string, requestedByUserId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    if (!project.track) throw new BadRequestException('Envie a musica antes de iniciar a analise');
    const current = project.childrenClipAudioAnalysis;
    if (current?.status === 'queued' || current?.status === 'analyzing') {
      throw new BadRequestException('A analise da musica ja esta em andamento');
    }

    const queued = await this.queue.enqueueAudioAnalysis({ projectId, organizationId, requestedByUserId });
    await this.prisma.$transaction([
      this.prisma.childrenClipAudioAnalysis.upsert({
        where: { projectId },
        create: { projectId, status: ChildrenClipAudioAnalysisStatus.queued, bullJobId: queued.bullJobId },
        update: {
          status: ChildrenClipAudioAnalysisStatus.queued,
          bullJobId: queued.bullJobId,
          errorMessage: null,
          analysisStartedAt: null,
          analysisCompletedAt: null
        }
      }),
      this.prisma.childrenClip.update({
        where: { projectId },
        data: { productionStatus: 'analyzing_audio' }
      }),
      this.prisma.processingJob.create({
        data: {
          projectId,
          queueName: CHILDREN_CLIP_QUEUE_NAME,
          jobName: CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME,
          bullJobId: queued.bullJobId,
          status: ProcessingJobStatus.queued,
          progress: 0,
          detailMessage: 'Analise da musica enfileirada.',
          activityLog: [{
            stage: 'QUEUED',
            message: 'Analise da musica enfileirada.',
            progress: 0,
            timestamp: new Date().toISOString()
          }]
        }
      })
    ]);

    return this.get(projectId, organizationId);
  }

  private async getOwnedProject(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null },
      include: { track: true, childrenClipAudioAnalysis: true }
    });
    if (!project) throw new NotFoundException('Children clip project not found');
    return project;
  }
}
