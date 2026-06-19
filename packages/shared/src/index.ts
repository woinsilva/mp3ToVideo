export const APP_NAME = 'Video SaaS MVP';

export const PROJECT_QUEUE_NAME = 'project-processing';
export const PROJECT_PROCESS_JOB_NAME = 'project.process';

export interface ProjectProcessingJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
}
