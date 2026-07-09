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
          lyricsExcerpt: 'city lights fade in the night',
          energy: 0.35
        },
        {
          type: 'verse',
          title: 'Verse 1',
          startSeconds: 6,
          endSeconds: 18,
          lyricsExcerpt: 'i walk alone beneath the signs',
          energy: 0.55
        },
        {
          type: 'chorus',
          title: 'Chorus 1',
          startSeconds: 18,
          endSeconds: 24,
          lyricsExcerpt: 'we rise and burn into the sky',
          energy: 0.85
        },
        {
          type: 'outro',
          title: 'Outro',
          startSeconds: 24,
          endSeconds: 30,
          lyricsExcerpt: 'the echo stays after goodbye',
          energy: 0.45
        }
      ],
      'A visual story that evolves with the music.'
    );

    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.every((scene) => scene.durationSeconds >= 4 && scene.durationSeconds <= 10)).toBe(true);
    expect(scenes[0].startSeconds).toBe(0);
    expect(scenes.at(-1)?.endSeconds).toBe(30);
    expect(scenes[0].lyricsExcerpt).toBe('city lights fade in the night');
    expect(scenes[0].description).toContain('Primary visual driver');
    expect(scenes[0].title).toContain('city lights fade in the night');
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
          lyricsExcerpt: 'hold on',
          energy: 0.35
        }
      ],
      'Short atmosphere cue.'
    );

    expect(scenes).toHaveLength(1);
    expect(scenes[0].durationSeconds).toBe(3.2);
    expect(scenes[0].endSeconds).toBe(3.2);
    expect(scenes[0].lyricsExcerpt).toBe('hold on');
  });

  it('uses the configured target scene duration when provided', () => {
    const service = new ScenePlanningService();

    const scenes = service.build(
      20,
      [
        {
          type: 'verse',
          title: 'Verse 1',
          startSeconds: 0,
          endSeconds: 20,
          lyricsExcerpt: 'money drops and the city wakes',
          energy: 0.7
        }
      ],
      'A celebratory night out.',
      5
    );

    expect(scenes).toHaveLength(4);
    expect(scenes.map((scene) => scene.durationSeconds)).toEqual([5, 5, 5, 5]);
    expect(scenes.at(-1)?.endSeconds).toBe(20);
  });
});
