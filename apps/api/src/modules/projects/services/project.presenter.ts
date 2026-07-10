import { Injectable } from '@nestjs/common';
import { SceneRenderAttemptStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  Lyrics,
  MusicSection,
  ProcessingJob,
  Project,
  ProjectStatus,
  Render,
  Scene,
  SceneRenderAttempt,
  ScenePrompt
} from '@prisma/client';

export interface ProcessingActivityEntry {
  stage: string;
  message: string;
  provider: string | null;
  progress: number | null;
  timestamp: string;
}

export interface ProjectLyricsStatusView {
  source: string;
  rawText: string;
  normalizedText: string;
}

export interface ProjectMusicSectionStatusView {
  type: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  lyricsExcerpt: string | null;
  energy: number | null;
}

@Injectable()
export class ProjectPresenter {
  private static readonly quietThresholdMs = 7 * 60_000;
  private static readonly longRunningThresholdMs = 10 * 60_000;

  summary(project: Project) {
    return {
      id: project.id,
      title: project.title,
      clipDurationSeconds: project.clipDurationSeconds,
      sceneDurationSeconds: project.sceneDurationSeconds,
      visualCheckpointName: project.visualCheckpointName,
      status: project.status,
      lyrics: null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  }

  summaryWithLyrics(
    project: Project & {
      lyrics?: Lyrics | null;
    }
  ) {
    return {
      id: project.id,
      title: project.title,
      clipDurationSeconds: project.clipDurationSeconds,
      sceneDurationSeconds: project.sceneDurationSeconds,
      visualCheckpointName: project.visualCheckpointName,
      status: project.status,
      lyrics: project.lyrics
        ? {
            source: project.lyrics.source,
            rawText: project.lyrics.rawText,
            normalizedText: project.lyrics.normalizedText
          }
        : null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  }

  uploadResult(projectId: string, trackId: string, status: ProjectStatus) {
    return {
      projectId,
      trackId,
      status
    };
  }

  status(
    project: Project & {
      lyrics?: Lyrics | null;
      musicSections?: MusicSection[];
      scenes?: Array<
        Scene & {
          renderAttempts?: SceneRenderAttempt[];
        }
      >;
    },
    processingJob?: ProcessingJob | null
  ) {
    const lastUpdatedAt = processingJob?.updatedAt ?? project.updatedAt;
    const renderRuntime = this.renderRuntime(project, processingJob);

    return {
      projectId: project.id,
      status: project.status,
      progress: processingJob?.progress ?? this.defaultProgress(project.status),
      currentStep: this.currentStep(project.status),
      detailMessage: processingJob?.detailMessage ?? null,
      activityLog: this.activityLog(processingJob?.activityLog),
      lyrics: project.lyrics
        ? {
            source: project.lyrics.source,
            rawText: project.lyrics.rawText,
            normalizedText: project.lyrics.normalizedText
          }
        : null,
      musicSections: (project.musicSections ?? []).map((section) => ({
        type: section.type,
        title: section.title,
        startSeconds: section.startSeconds,
        endSeconds: section.endSeconds,
        lyricsExcerpt: section.lyricsExcerpt,
        energy: section.energy
      })),
      errorMessage: project.errorMessage ?? processingJob?.errorMessage ?? null,
      lastUpdatedAt,
      renderRuntime,
      isPossiblyStalled:
        !this.isTerminalStatus(project.status) &&
        Date.now() - lastUpdatedAt.getTime() > ProjectPresenter.quietThresholdMs
    };
  }

  scene(
    scene: Scene & {
      prompt: ScenePrompt | null;
      referenceImageAsset?: { id: string } | null;
      renderAttempts?: SceneRenderAttempt[];
    }
  ) {
    const latestAttempt = this.latestAttempt(scene.renderAttempts ?? []);

    return {
      id: scene.id,
      index: scene.index,
      title: scene.title,
      description: scene.description,
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      durationSeconds: scene.durationSeconds,
      status: scene.status,
      visualProvider: scene.visualProvider,
      videoAssetId: scene.videoAssetId,
      referenceImageAssetId: scene.referenceImageAssetId,
      hasReferenceImage: Boolean(scene.referenceImageAsset),
      attemptSummary: latestAttempt ? this.attemptSummary(latestAttempt) : null,
      prompt: scene.prompt
        ? {
            provider: scene.prompt.provider,
            positivePrompt: scene.prompt.positivePrompt,
            negativePrompt: scene.prompt.negativePrompt,
            style: scene.prompt.style,
            camera: scene.prompt.camera
          }
        : null
    };
  }

  render(render: Render & { asset: { id: string; mimeType: string; storagePath: string; sizeBytes: number } | null }) {
    return {
      id: render.id,
      status: render.status,
      durationSeconds: render.durationSeconds,
      asset: render.asset
        ? {
            id: render.asset.id,
            mimeType: render.asset.mimeType,
            storagePath: render.asset.storagePath,
            sizeBytes: render.asset.sizeBytes
          }
        : null
    };
  }

  private defaultProgress(status: ProjectStatus): number {
    switch (status) {
      case 'draft':
        return 0;
      case 'uploaded':
        return 5;
      case 'queued':
        return 10;
      case 'processing':
        return 15;
      case 'analyzing':
        return 25;
      case 'storyboarding':
        return 55;
      case 'generating_scenes':
        return 85;
      case 'rendering':
        return 95;
      case 'completed':
        return 100;
      case 'failed':
        return 0;
      default:
        return 0;
    }
  }

  private currentStep(status: ProjectStatus): string {
    switch (status) {
      case 'draft':
        return 'Aguardando upload do audio';
      case 'uploaded':
        return 'Upload concluido';
      case 'queued':
        return 'Na fila de processamento';
      case 'processing':
        return 'Preparando pipeline';
      case 'analyzing':
        return 'Analisando audio';
      case 'storyboarding':
        return 'Montando storyboard';
      case 'generating_scenes':
        return 'Gerando cenas';
      case 'rendering':
        return 'Renderizando video final';
      case 'completed':
        return 'Concluido';
      case 'failed':
        return 'Falhou';
      default:
        return 'Status desconhecido';
    }
  }

  private isTerminalStatus(status: ProjectStatus): boolean {
    return status === 'completed' || status === 'failed';
  }

  private renderRuntime(
    project: Project & {
      scenes?: Array<
        Scene & {
          renderAttempts?: SceneRenderAttempt[];
        }
      >;
    },
    processingJob?: ProcessingJob | null
  ) {
    if (project.status !== 'rendering') {
      return null;
    }

    const attempts = (project.scenes ?? []).flatMap((scene) =>
      (scene.renderAttempts ?? []).map((attempt) => ({
        scene,
        attempt
      }))
    );
    const active = attempts
      .filter(({ attempt }) => this.isActiveAttemptStatus(attempt.status))
      .sort((left, right) => right.attempt.updatedAt.getTime() - left.attempt.updatedAt.getTime())[0];
    const totalStartedAt = processingJob?.createdAt ?? project.updatedAt;
    const now = Date.now();

    if (!active) {
      return {
        totalElapsedSeconds: Math.floor((now - totalStartedAt.getTime()) / 1000),
        currentStageElapsedSeconds: Math.floor((now - lastDate(processingJob?.updatedAt, project.updatedAt).getTime()) / 1000),
        currentSceneElapsedSeconds: null,
        lastServerHeartbeatAt: processingJob?.updatedAt?.toISOString() ?? null,
        lastExternalHeartbeatAt: null,
        health: 'normal',
        activeScene: null
      };
    }

    const lastServerHeartbeat = active.attempt.lastHeartbeatAt ?? active.attempt.updatedAt;
    const externalHeartbeat = active.attempt.firstExternalSeenAt ?? null;
    const currentSceneElapsedMs = now - active.attempt.startedAt.getTime();
    const missingServerHeartbeatMs = now - lastServerHeartbeat.getTime();
    const health =
      missingServerHeartbeatMs > ProjectPresenter.quietThresholdMs
        ? 'suspected_stuck'
        : currentSceneElapsedMs > ProjectPresenter.longRunningThresholdMs
          ? 'long_running'
          : 'normal';

    return {
      totalElapsedSeconds: Math.floor((now - totalStartedAt.getTime()) / 1000),
      currentStageElapsedSeconds: Math.floor(currentSceneElapsedMs / 1000),
      currentSceneElapsedSeconds: Math.floor(currentSceneElapsedMs / 1000),
      lastServerHeartbeatAt: lastServerHeartbeat.toISOString(),
      lastExternalHeartbeatAt: externalHeartbeat?.toISOString() ?? null,
      health,
      activeScene: {
        sceneId: active.scene.id,
        index: active.scene.index,
        title: active.scene.title,
        attemptNumber: active.attempt.attemptNumber,
        provider: active.attempt.provider,
        promptId: active.attempt.promptId
      }
    };
  }

  private latestAttempt(attempts: SceneRenderAttempt[]): SceneRenderAttempt | null {
    return [...attempts].sort((left, right) => right.attemptNumber - left.attemptNumber)[0] ?? null;
  }

  private attemptSummary(attempt: SceneRenderAttempt) {
    const elapsedSeconds = Math.floor(
      ((attempt.finishedAt ?? new Date()).getTime() - attempt.startedAt.getTime()) / 1000
    );

    return {
      activeAttemptId: this.isActiveAttemptStatus(attempt.status) ? attempt.id : null,
      latestAttemptStatus: attempt.status,
      attemptNumber: attempt.attemptNumber,
      elapsedSeconds,
      lastHeartbeatAt: attempt.lastHeartbeatAt?.toISOString() ?? null,
      lastExternalHeartbeatAt: attempt.firstExternalSeenAt?.toISOString() ?? null,
      canRetryAttempt: this.canRetryAttempt(attempt)
    };
  }

  private canRetryAttempt(attempt: SceneRenderAttempt): boolean {
    if (attempt.status === SceneRenderAttemptStatus.failed) {
      return true;
    }

    if (!this.isActiveAttemptStatus(attempt.status)) {
      return false;
    }

    return Date.now() - attempt.startedAt.getTime() > ProjectPresenter.longRunningThresholdMs;
  }

  private isActiveAttemptStatus(status: SceneRenderAttemptStatus): boolean {
    return (
      status === SceneRenderAttemptStatus.queued ||
      status === SceneRenderAttemptStatus.submitted ||
      status === SceneRenderAttemptStatus.waiting_external ||
      status === SceneRenderAttemptStatus.confirmed_external_active
    );
  }

  private activityLog(activityLog: Prisma.JsonValue | null | undefined): ProcessingActivityEntry[] {
    if (!Array.isArray(activityLog)) {
      return [];
    }

    const entries: ProcessingActivityEntry[] = [];

    for (const value of activityLog) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const entry = value as Record<string, unknown>;

      if (
        typeof entry.stage !== 'string' ||
        typeof entry.message !== 'string' ||
        typeof entry.timestamp !== 'string'
      ) {
        continue;
      }

      entries.push({
        stage: entry.stage,
        message: entry.message,
        provider: typeof entry.provider === 'string' ? entry.provider : null,
        progress: typeof entry.progress === 'number' ? entry.progress : null,
        timestamp: entry.timestamp
      });
    }

    return entries;
  }
}

function lastDate(...dates: Array<Date | undefined | null>): Date {
  return dates.filter(Boolean).sort((left, right) => right!.getTime() - left!.getTime())[0]!;
}
