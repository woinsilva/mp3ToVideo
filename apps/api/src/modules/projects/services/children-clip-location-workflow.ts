export interface LocationWorkflowShot {
  id: string;
  index: number;
  hasUsableBackground: boolean;
  hasApprovedBackground?: boolean;
}

export function selectLocationGenerationTargets(shots: LocationWorkflowShot[], hasApprovedMaster: boolean) {
  const ordered = [...shots].sort((left, right) => left.index - right.index);
  if (!ordered.length) return [];
  if (!hasApprovedMaster) return ordered[0].hasUsableBackground ? [] : [ordered[0].id];
  return ordered.filter((shot) => !shot.hasUsableBackground).map((shot) => shot.id);
}

export function locationWorkflowPhase(shots: LocationWorkflowShot[], hasApprovedMaster: boolean, masterPendingReview: boolean, masterGenerating = false) {
  if (!hasApprovedMaster) {
    if (masterGenerating) return 'master_generating' as const;
    return masterPendingReview ? 'master_in_review' as const : 'needs_master' as const;
  }
  if (shots.every((shot) => shot.hasApprovedBackground)) return 'complete' as const;
  return shots.every((shot) => shot.hasUsableBackground) ? 'variants_in_review' as const : 'ready_for_variants' as const;
}
