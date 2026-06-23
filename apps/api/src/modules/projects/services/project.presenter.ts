import { Injectable } from '@nestjs/common';
import type {
  ProcessingJob,
  Project,
  ProjectStatus,
  Render,
  Scene,
  ScenePrompt
} from '@prisma/client';

@Injectable()
export class ProjectPresenter {
  private static readonly stallThresholdMs = 45_000;

  summary(project: Project) {
    return {
      id: project.id,
      title: project.title,
      clipDurationSeconds: project.clipDurationSeconds,
      status: project.status,
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

  status(project: Project, processingJob?: ProcessingJob | null) {
    const lastUpdatedAt = processingJob?.updatedAt ?? project.updatedAt;

    return {
      projectId: project.id,
      status: project.status,
      progress: processingJob?.progress ?? this.defaultProgress(project.status),
      currentStep: this.currentStep(project.status),
      errorMessage: project.errorMessage ?? processingJob?.errorMessage ?? null,
      lastUpdatedAt,
      isPossiblyStalled:
        !this.isTerminalStatus(project.status) &&
        Date.now() - lastUpdatedAt.getTime() > ProjectPresenter.stallThresholdMs
    };
  }

  scene(scene: Scene & { prompt: ScenePrompt | null }) {
    return {
      id: scene.id,
      index: scene.index,
      title: scene.title,
      description: scene.description,
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      durationSeconds: scene.durationSeconds,
      status: scene.status,
      videoAssetId: scene.videoAssetId,
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
}
