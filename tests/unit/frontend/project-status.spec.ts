import { describe, expect, it } from 'vitest';

import {
  buildProjectStatusSteps,
  isTerminalProjectStatus,
  projectStatusTone
} from '../../../apps/frontend/src/utils/project-status';

describe('frontend project status helpers', () => {
  it('builds a completed timeline with reached steps', () => {
    const steps = buildProjectStatusSteps('completed');

    expect(steps).toHaveLength(6);
    expect(steps.every((step) => step.reached)).toBe(true);
    expect(steps.at(-1)?.active).toBe(true);
  });

  it('classifies terminal statuses and tones', () => {
    expect(isTerminalProjectStatus('completed')).toBe(true);
    expect(isTerminalProjectStatus('failed')).toBe(true);
    expect(isTerminalProjectStatus('rendering')).toBe(false);
    expect(projectStatusTone('failed')).toBe('error');
    expect(projectStatusTone('completed')).toBe('success');
    expect(projectStatusTone('queued')).toBe('info');
  });
});
