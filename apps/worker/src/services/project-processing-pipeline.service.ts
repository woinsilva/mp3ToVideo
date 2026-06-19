import { Injectable } from '@nestjs/common';
import type { ProjectProcessingJobPayload } from '@video/shared';

@Injectable()
export class ProjectProcessingPipelineService {
  async run(_payload: ProjectProcessingJobPayload): Promise<void> {
    return;
  }
}
