import { Injectable } from '@nestjs/common';
import type { ProjectProcessingJobPayload } from '@video/shared';

interface BuildProjectProcessingPayloadInput {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
}

@Injectable()
export class ProjectProcessingPayloadFactory {
  build(input: BuildProjectProcessingPayloadInput): ProjectProcessingJobPayload {
    return {
      projectId: input.projectId,
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId
    };
  }
}
