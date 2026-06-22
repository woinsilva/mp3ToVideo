import { describe, expect, it } from 'vitest';

import { ProjectPresenter } from '../../../apps/api/src/modules/projects/services/project.presenter';

describe('ProjectPresenter', () => {
  it('maps project status responses with current step and progress', () => {
    const presenter = new ProjectPresenter();

    expect(
      presenter.status(
        {
          id: 'project-1',
          organizationId: 'org-1',
          createdByUserId: 'user-1',
          title: 'Clip',
          status: 'rendering',
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        },
        {
          id: 'job-1',
          projectId: 'project-1',
          queueName: 'project-processing',
          jobName: 'project.process',
          bullJobId: '1',
          status: 'active',
          progress: 95,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      )
    ).toEqual({
      projectId: 'project-1',
      status: 'rendering',
      progress: 95,
      currentStep: 'Rendering final video',
      errorMessage: null
    });
  });
});
