export const APP_NAME = 'Video SaaS MVP';

export const PROJECT_QUEUE_NAME = 'project-processing';
export const PROJECT_PROCESS_JOB_NAME = 'project.process';
export const FRAME_INTERPOLATION_QUEUE_NAME = 'frame-interpolation';
export const FRAME_INTERPOLATION_JOB_NAME = 'render.interpolate';
export const CHILDREN_CLIP_QUEUE_NAME = 'children-clip-production';
export const CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME = 'children-clip.character.generate';
export const CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME = 'children-clip.audio.analyze';
export const CHILDREN_CLIP_PLAN_GENERATE_JOB_NAME = 'children-clip.plan.generate';
export const CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME = 'children-clip.asset.generate';
export const CHILDREN_CLIP_SHOT_RENDER_JOB_NAME = 'children-clip.shot.render2d';
export const CHILDREN_CLIP_HERO_SHOT_JOB_NAME = 'children-clip.shot.wan';
export const CHILDREN_CLIP_FINAL_RENDER_JOB_NAME = 'children-clip.final.render';

export interface ProjectProcessingJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
}

export interface FrameInterpolationJobPayload {
  projectId: string;
  organizationId: string;
  sourceAssetId: string;
}

export interface ChildrenClipCharacterGenerationJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  characterId: string;
  characterVersionId: string;
}

export interface ChildrenClipAudioAnalysisJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
}

export interface ChildrenClipPlanGenerationJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  revisionInstruction?: string | null;
}

export interface ChildrenClipAssetGenerationJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  shotAssetId: string;
}

export interface ChildrenClipShotRenderJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  renderAttemptId: string;
}

export interface ChildrenClipHeroShotJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  heroAttemptId: string;
}

export interface ChildrenClipFinalRenderJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  finalRenderId: string;
}
