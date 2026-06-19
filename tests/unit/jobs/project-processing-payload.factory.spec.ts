import { describe, expect, it } from 'vitest';

import { ProjectProcessingPayloadFactory } from '../../../apps/api/src/modules/jobs/services/project-processing-payload.factory';

describe('ProjectProcessingPayloadFactory', () => {
  it('builds the processing payload expected by the queue', () => {
    const factory = new ProjectProcessingPayloadFactory();

    expect(
      factory.build({
        projectId: 'project-1',
        organizationId: 'org-1',
        requestedByUserId: 'user-1'
      })
    ).toEqual({
      projectId: 'project-1',
      organizationId: 'org-1',
      requestedByUserId: 'user-1'
    });
  });
});
