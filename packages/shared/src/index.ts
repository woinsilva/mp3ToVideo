export const APP_NAME = 'Video SaaS MVP';

export const PROJECT_QUEUE_NAME = 'project-processing';
export const PROJECT_PROCESS_JOB_NAME = 'project.process';
export const FRAME_INTERPOLATION_QUEUE_NAME = 'frame-interpolation';
export const FRAME_INTERPOLATION_JOB_NAME = 'render.interpolate';

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
