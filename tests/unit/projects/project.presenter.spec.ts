import { describe, expect, it } from 'vitest';

import { ProjectPresenter } from '../../../apps/api/src/modules/projects/services/project.presenter';

describe('ProjectPresenter', () => {
  it('maps project summaries with optional clip duration', () => {
    const presenter = new ProjectPresenter();
    const now = new Date();

    expect(
      presenter.summary({
        id: 'project-1',
        organizationId: 'org-1',
        createdByUserId: 'user-1',
        title: 'Clip',
        clipDurationSeconds: 20,
        status: 'draft',
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
    ).toEqual({
      id: 'project-1',
      title: 'Clip',
      clipDurationSeconds: 20,
      status: 'draft',
      createdAt: now,
      updatedAt: now
    });
  });

  it('maps project status responses with current step and progress', () => {
    const presenter = new ProjectPresenter();
    const now = new Date();

    expect(
      presenter.status(
        {
          id: 'project-1',
          organizationId: 'org-1',
          createdByUserId: 'user-1',
          title: 'Clip',
          clipDurationSeconds: null,
          status: 'rendering',
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
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
          createdAt: now,
          updatedAt: now
        }
      )
    ).toEqual({
      projectId: 'project-1',
      status: 'rendering',
      progress: 95,
      currentStep: 'Rendering final video',
      errorMessage: null,
      lastUpdatedAt: now,
      isPossiblyStalled: false
    });
  });
});
