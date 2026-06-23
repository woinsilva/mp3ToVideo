import { describe, expect, it } from 'vitest';

import {
  buildProjectStatusSteps,
  formatProjectStatusLabel,
  formatRelativeStatusUpdate,
  isTerminalProjectStatus,
  projectStatusTone
} from '../../../apps/frontend/src/utils/project-status';

describe('frontend project status helpers', () => {
  it('builds a completed timeline with reached steps', () => {
    const steps = buildProjectStatusSteps('completed', 100);

    expect(steps).toHaveLength(6);
    expect(steps.every((step) => step.reached)).toBe(true);
    expect(steps.at(-1)?.active).toBe(true);
  });

  it('does not mark the completed step as reached when a project fails', () => {
    const steps = buildProjectStatusSteps('failed', 55);

    expect(steps.find((step) => step.key === 'storyboarding')?.reached).toBe(true);
    expect(steps.find((step) => step.key === 'completed')?.reached).toBe(false);
    expect(steps.find((step) => step.key === 'completed')?.active).toBe(false);
  });

  it('classifies terminal statuses and tones', () => {
    expect(isTerminalProjectStatus('completed')).toBe(true);
    expect(isTerminalProjectStatus('failed')).toBe(true);
    expect(isTerminalProjectStatus('rendering')).toBe(false);
    expect(projectStatusTone('failed')).toBe('error');
    expect(projectStatusTone('completed')).toBe('success');
    expect(projectStatusTone('queued')).toBe('info');
    expect(formatProjectStatusLabel('generating_scenes')).toBe('Gerando cenas');
  });

  it('formats relative update timestamps for the processing UI', () => {
    expect(formatRelativeStatusUpdate('2026-06-22T15:00:00.000Z', Date.parse('2026-06-22T15:00:12.000Z'))).toBe(
      'atualizado ha 12s'
    );
    expect(formatRelativeStatusUpdate('2026-06-22T15:00:00.000Z', Date.parse('2026-06-22T15:02:00.000Z'))).toBe(
      'atualizado ha 2min'
    );
  });
});
