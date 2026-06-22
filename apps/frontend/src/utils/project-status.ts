import type { ProjectStatus } from '@/types/project.types';

export interface StatusStep {
  key: string;
  label: string;
  reached: boolean;
  active: boolean;
}

const statusOrder: ProjectStatus[] = [
  'draft',
  'uploaded',
  'queued',
  'processing',
  'analyzing',
  'storyboarding',
  'generating_scenes',
  'rendering',
  'completed',
  'failed'
];

export function isTerminalProjectStatus(status: ProjectStatus): boolean {
  return status === 'completed' || status === 'failed';
}

export function buildProjectStatusSteps(status: ProjectStatus): StatusStep[] {
  const activeIndex = statusOrder.indexOf(status);

  return [
    { key: 'uploaded', label: 'Upload', reached: activeIndex >= 1, active: status === 'uploaded' },
    { key: 'analyzing', label: 'Analise', reached: activeIndex >= 4, active: status === 'analyzing' },
    { key: 'storyboarding', label: 'Storyboard', reached: activeIndex >= 5, active: status === 'storyboarding' },
    {
      key: 'generating_scenes',
      label: 'Cenas',
      reached: activeIndex >= 6,
      active: status === 'generating_scenes'
    },
    { key: 'rendering', label: 'Renderizacao', reached: activeIndex >= 7, active: status === 'rendering' },
    { key: 'completed', label: 'Concluido', reached: activeIndex >= 8, active: status === 'completed' }
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
