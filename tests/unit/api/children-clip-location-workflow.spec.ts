import { describe, expect, it } from 'vitest';

import { locationWorkflowPhase, selectLocationGenerationTargets } from '../../../apps/api/src/modules/projects/services/children-clip-location-workflow';

const shots = [
  { id: 'wide', index: 0, hasUsableBackground: false },
  { id: 'platform', index: 1, hasUsableBackground: false },
  { id: 'tracks', index: 2, hasUsableBackground: false }
];

describe('children clip Location workflow', () => {
  it('generates only the anchor while a Location has no approved master', () => {
    expect(selectLocationGenerationTargets(shots, false)).toEqual(['wide']);
    expect(locationWorkflowPhase(shots, false, false)).toBe('needs_master');
  });

  it('waits for review instead of generating independent variants', () => {
    const pending = [{ ...shots[0], hasUsableBackground: true }, ...shots.slice(1)];
    expect(selectLocationGenerationTargets(pending, false)).toEqual([]);
    expect(locationWorkflowPhase(pending, false, true)).toBe('master_in_review');
  });

  it('exposes master generation separately from review', () => {
    expect(locationWorkflowPhase([{ ...shots[0], hasUsableBackground: true }], false, false, true)).toBe('master_generating');
  });

  it('generates only missing variants after the master is approved', () => {
    const withOneVariant = [
      { ...shots[0], hasUsableBackground: true },
      { ...shots[1], hasUsableBackground: true },
      shots[2]
    ];
    expect(selectLocationGenerationTargets(withOneVariant, true)).toEqual(['tracks']);
    expect(locationWorkflowPhase(withOneVariant, true, false)).toBe('ready_for_variants');
  });

  it('marks a Location complete when every planned view has a usable background', () => {
    const complete = shots.map((shot) => ({ ...shot, hasUsableBackground: true, hasApprovedBackground: true }));
    expect(selectLocationGenerationTargets(complete, true)).toEqual([]);
    expect(locationWorkflowPhase(complete, true, false)).toBe('complete');
  });

  it('keeps generated variants in review until every view is approved', () => {
    const reviewing = shots.map((shot) => ({ ...shot, hasUsableBackground: true, hasApprovedBackground: shot.id === 'wide' }));
    expect(locationWorkflowPhase(reviewing, true, false)).toBe('variants_in_review');
  });
});
