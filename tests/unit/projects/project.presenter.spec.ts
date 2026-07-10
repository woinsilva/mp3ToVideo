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
        sceneDurationSeconds: 5,
        visualCheckpointName: 'sd_xl_turbo_1.0.safetensors',
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
      sceneDurationSeconds: 5,
      visualCheckpointName: 'sd_xl_turbo_1.0.safetensors',
      status: 'draft',
      lyrics: null,
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
          sceneDurationSeconds: null,
          visualCheckpointName: null,
          status: 'rendering',
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          lyrics: {
            id: 'lyrics-1',
            projectId: 'project-1',
            source: 'whisper',
            rawText: 'Hello world',
            normalizedText: 'hello world',
            createdAt: now,
            updatedAt: now
          },
          musicSections: [
            {
              id: 'section-1',
              projectId: 'project-1',
              type: 'verse',
              title: 'Verse 1',
              startSeconds: 0,
              endSeconds: 8,
              lyricsExcerpt: 'Hello world',
              energy: 0.55,
              createdAt: now,
              updatedAt: now
            }
          ]
        },
        {
          id: 'job-1',
          projectId: 'project-1',
          queueName: 'project-processing',
          jobName: 'project.process',
          bullJobId: '1',
          status: 'active',
          progress: 95,
          detailMessage: 'Muxando audio final.',
          activityLog: [
            {
              stage: 'rendering',
              message: 'Concatenando cenas.',
              provider: null,
              progress: 96,
              timestamp: now.toISOString()
            }
          ],
          errorMessage: null,
          createdAt: now,
          updatedAt: now
        }
      )
    ).toEqual({
      projectId: 'project-1',
      status: 'rendering',
      progress: 95,
      currentStep: 'Renderizando video final',
      detailMessage: 'Muxando audio final.',
      activityLog: [
        {
          stage: 'rendering',
          message: 'Concatenando cenas.',
          provider: null,
          progress: 96,
          timestamp: now.toISOString()
        }
      ],
      lyrics: {
        source: 'whisper',
        rawText: 'Hello world',
        normalizedText: 'hello world'
      },
      musicSections: [
        {
          type: 'verse',
          title: 'Verse 1',
          startSeconds: 0,
          endSeconds: 8,
          lyricsExcerpt: 'Hello world',
          energy: 0.55
        }
      ],
      errorMessage: null,
      lastUpdatedAt: now,
      renderRuntime: {
        totalElapsedSeconds: expect.any(Number),
        currentStageElapsedSeconds: expect.any(Number),
        currentSceneElapsedSeconds: null,
        lastServerHeartbeatAt: now.toISOString(),
        lastExternalHeartbeatAt: null,
        health: 'normal',
        activeScene: null
      },
      isPossiblyStalled: false
    });
  });
});
