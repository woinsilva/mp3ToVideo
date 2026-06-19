import { describe, expect, it } from 'vitest';

import { ScenePlanningService } from '../../../apps/worker/src/services/scene-planning.service';

describe('ScenePlanningService', () => {
  it('splits a standard track into scenes between 4 and 10 seconds', () => {
    const service = new ScenePlanningService();

    const scenes = service.build(
      30,
      [
        {
          type: 'intro',
          title: 'Intro',
          startSeconds: 0,
          endSeconds: 6,
          lyricsExcerpt: null,
          energy: 0.35
        },
        {
          type: 'verse',
          title: 'Verse 1',
          startSeconds: 6,
          endSeconds: 18,
          lyricsExcerpt: null,
          energy: 0.55
        },
        {
          type: 'chorus',
          title: 'Chorus 1',
          startSeconds: 18,
          endSeconds: 24,
          lyricsExcerpt: null,
          energy: 0.85
        },
        {
          type: 'outro',
          title: 'Outro',
          startSeconds: 24,
          endSeconds: 30,
          lyricsExcerpt: null,
          energy: 0.45
        }
      ],
      'A visual story that evolves with the music.'
    );

    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.every((scene) => scene.durationSeconds >= 4 && scene.durationSeconds <= 10)).toBe(true);
    expect(scenes[0].startSeconds).toBe(0);
    expect(scenes.at(-1)?.endSeconds).toBe(30);
  });

  it('allows a single short scene when the whole track is shorter than four seconds', () => {
    const service = new ScenePlanningService();

    const scenes = service.build(
      3.2,
      [
        {
          type: 'intro',
          title: 'Intro',
          startSeconds: 0,
          endSeconds: 3.2,
          lyricsExcerpt: null,
          energy: 0.35
        }
      ],
      'Short atmosphere cue.'
    );

    expect(scenes).toHaveLength(1);
    expect(scenes[0].durationSeconds).toBe(3.2);
    expect(scenes[0].endSeconds).toBe(3.2);
  });
});
