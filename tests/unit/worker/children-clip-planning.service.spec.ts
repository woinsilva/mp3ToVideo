import { describe, expect, it } from 'vitest';

import { ChildrenClipPlanningService } from '../../../apps/worker/src/services/children-clip-planning.service';

describe('ChildrenClipPlanningService', () => {
  it('builds a contiguous beat-snapped timeline covering the whole song', () => {
    const service = new ChildrenClipPlanningService();
    const result = service.build({
      title: 'Horta feliz', concept: 'amigos plantam uma horta', visualStyle: '2D colorido',
      audienceAgeMin: 2, audienceAgeMax: 7, durationSeconds: 20,
      beatGrid: Array.from({ length: 41 }, (_, index) => index * 0.5),
      sections: [
        { id: 's1', title: 'Verse', type: 'verse', startSeconds: 0, endSeconds: 10, lyricsExcerpt: null, energy: 0.5 },
        { id: 's2', title: 'Chorus', type: 'chorus', startSeconds: 10, endSeconds: 20, lyricsExcerpt: null, energy: 0.8 }
      ],
      cues: [{ text: 'Vamos plantar', startSeconds: 2, endSeconds: 5 }],
      characters: [{ name: 'Bibi', roleName: 'Protagonista', versionId: 'v1', description: 'Coelha de vestido amarelo' }],
      creative: null
    });

    expect(result.shots.length).toBeGreaterThanOrEqual(4);
    expect(result.shots[0].startSeconds).toBe(0);
    expect(result.shots.at(-1)?.endSeconds).toBe(20);
    result.shots.slice(1).forEach((shot, index) => expect(shot.startSeconds).toBe(result.shots[index].endSeconds));
    expect(result.shots.some((shot) => shot.lyricText === 'Vamos plantar')).toBe(true);
    expect(result.visualBible.characterRules).toEqual(expect.arrayContaining([expect.objectContaining({ approvedVersionId: 'v1' })]));
  });

  it('falls back safely when the model returns sectionPlans with the wrong shape', () => {
    const service = new ChildrenClipPlanningService();
    const result = service.build({
      title: 'Teste', concept: 'brincadeira', visualStyle: '2D', audienceAgeMin: 2, audienceAgeMax: 6,
      durationSeconds: 8, beatGrid: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      sections: [{ id: 's1', title: 'Verse', type: 'verse', startSeconds: 0, endSeconds: 8, lyricsExcerpt: null, energy: 0.5 }],
      cues: [], characters: [],
      creative: { sectionPlans: {} as never, visualBible: 'invalid' as never, narrative: [] as never }
    });
    expect(result.shots.length).toBeGreaterThan(0);
    expect(result.visualBible.style).toBe('2D');
  });
});
