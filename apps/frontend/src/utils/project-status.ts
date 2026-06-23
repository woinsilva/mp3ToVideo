import type { ProjectStatus } from '@/types/project.types';

export interface StatusStep {
  key: string;
  label: string;
  reached: boolean;
  active: boolean;
}

const statusLabels: Record<ProjectStatus, string> = {
  draft: 'Rascunho',
  uploaded: 'Upload concluido',
  queued: 'Na fila',
  processing: 'Processando',
  analyzing: 'Analisando audio',
  storyboarding: 'Criando storyboard',
  generating_scenes: 'Gerando cenas',
  rendering: 'Renderizando',
  completed: 'Concluido',
  failed: 'Falhou'
};

const stepThresholds = {
  upload: 5,
  analyzing: 25,
  storyboarding: 55,
  generatingScenes: 85,
  rendering: 95
};

export function isTerminalProjectStatus(status: ProjectStatus): boolean {
  return status === 'completed' || status === 'failed';
}

export function formatProjectStatusLabel(status: ProjectStatus): string {
  return statusLabels[status];
}

export function buildProjectStatusSteps(
  status: ProjectStatus,
  progress = 0
): StatusStep[] {
  const safeProgress = Math.max(0, Math.min(100, progress));
  const reachedUpload =
    status !== 'draft' && (safeProgress >= stepThresholds.upload || status === 'completed');
  const reachedAnalyzing =
    ['analyzing', 'storyboarding', 'generating_scenes', 'rendering', 'completed'].includes(
      status
    ) || safeProgress >= stepThresholds.analyzing;
  const reachedStoryboarding =
    ['storyboarding', 'generating_scenes', 'rendering', 'completed'].includes(status) ||
    safeProgress >= stepThresholds.storyboarding;
  const reachedGeneratingScenes =
    ['generating_scenes', 'rendering', 'completed'].includes(status) ||
    safeProgress >= stepThresholds.generatingScenes;
  const reachedRendering =
    ['rendering', 'completed'].includes(status) || safeProgress >= stepThresholds.rendering;

  return [
    {
      key: 'uploaded',
      label: 'Upload',
      reached: reachedUpload,
      active: ['uploaded', 'queued', 'processing'].includes(status)
    },
    {
      key: 'analyzing',
      label: 'Analise',
      reached: reachedAnalyzing,
      active: status === 'analyzing'
    },
    {
      key: 'storyboarding',
      label: 'Storyboard',
      reached: reachedStoryboarding,
      active: status === 'storyboarding'
    },
    {
      key: 'generating_scenes',
      label: 'Cenas',
      reached: reachedGeneratingScenes,
      active: status === 'generating_scenes'
    },
    {
      key: 'rendering',
      label: 'Renderizacao',
      reached: reachedRendering,
      active: status === 'rendering'
    },
    {
      key: 'completed',
      label: 'Concluido',
      reached: status === 'completed',
      active: status === 'completed'
    }
  ];
}

export function projectStatusTone(status: ProjectStatus): 'error' | 'success' | 'warning' | 'info' {
  if (status === 'failed') {
    return 'error';
  }

  if (status === 'completed') {
    return 'success';
  }

  if (status === 'draft') {
    return 'warning';
  }

  return 'info';
}

export function formatRelativeStatusUpdate(value: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));

  if (seconds < 60) {
    return `atualizado ha ${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `atualizado ha ${minutes}min`;
  }

  const hours = Math.floor(minutes / 60);
  return `atualizado ha ${hours}h`;
}
