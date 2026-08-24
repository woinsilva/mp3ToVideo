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

  it('builds distinct shot semantics, reuses locations and forbids future entities', () => {
    const service = new ChildrenClipPlanningService();
    const result = service.build({
      title: 'Viagem musical', concept: 'Resumo global que nao deve virar descricao de tomada.', visualStyle: '2D colorido',
      audienceAgeMin: 2, audienceAgeMax: 7, durationSeconds: 20,
      beatGrid: Array.from({ length: 41 }, (_, index) => index * 0.5),
      sections: [
        { id: 'intro', title: 'Intro', type: 'intro', startSeconds: 0, endSeconds: 10, lyricsExcerpt: null, energy: 0.4 },
        { id: 'verse', title: 'Verse 1', type: 'verse', startSeconds: 10, endSeconds: 20, lyricsExcerpt: null, energy: 0.7 }
      ],
      cues: [
        { text: 'Vamos partir', startSeconds: 1, endSeconds: 5 },
        { text: 'Beto chegou', startSeconds: 11, endSeconds: 15 }
      ],
      characters: [
        { name: 'Ana', roleName: 'Guia', versionId: 'ana-v1', description: 'Guia alegre' },
        { name: 'Beto', roleName: 'Amigo futuro', versionId: 'beto-v1', description: 'Amigo azul' },
        { name: 'Expresso', roleName: 'Veiculo', versionId: 'train-v1', description: 'Veiculo colorido' }
      ],
      creative: {
        visualBible: { characterRules: [
          { name: 'Ana', type: 'character', identity: 'Guia alegre' },
          { name: 'Beto', type: 'character', identity: 'Amigo azul' },
          { name: 'Expresso', type: 'vehicle', identity: 'Veiculo sem rosto' }
        ] },
        narrative: { summary: 'Resumo global que nao deve virar descricao de tomada.', storyBeats: [
          { section: 'Intro', focus: ['Ana', 'Expresso'], purpose: 'Apresentar a viagem' },
          { section: 'Verse 1', focus: ['Beto'], purpose: 'Apresentar o novo amigo' }
        ] },
        locations: [{ key: 'estacao', name: 'Estacao brinquedo', description: 'Plataforma de madeira e colinas', timeOfDay: 'manha clara' }],
        shotPlans: [
          { shotIndex: 0, locationKey: 'estacao', allowedEntities: ['Ana', 'Expresso', 'Beto'], primaryFocus: 'Expresso', action: 'O veiculo aguarda a partida', composition: 'plano geral' },
          { shotIndex: 1, locationKey: 'estacao', allowedEntities: ['Ana', 'Expresso'], primaryFocus: 'Ana', action: 'Ana sinaliza a partida', composition: 'plano medio' },
          { shotIndex: 2, locationKey: 'estacao', allowedEntities: ['Beto'], primaryFocus: 'Beto', action: 'Beto aparece pela primeira vez', composition: 'close-up' }
        ]
      }
    });

    expect(result.shots[0].description).not.toBe(result.narrative.summary);
    expect(result.shots[0].description).not.toBe(result.shots[1].description);
    expect(result.shots[0].locationKey).toBe(result.shots[1].locationKey);
    expect(result.locations).toHaveLength(2); // estacao plus deterministic fallback for Verse 1's unmatched later shot
    expect(result.shots[0].characterVersionIds).not.toContain('beto-v1');
    expect(result.shots[0].forbiddenEntityVersionIds).toContain('beto-v1');
    expect(result.shots[0].layers).toContainEqual(expect.objectContaining({ versionId: 'train-v1', type: 'entity' }));
  });

  it('uses a shot-specific deterministic fallback instead of copying the global summary', () => {
    const service = new ChildrenClipPlanningService();
    const summary = 'Uma historia global muito longa sobre todo o arco da aventura.';
    const result = service.build({
      title: 'Fallback', concept: summary, visualStyle: '2D', audienceAgeMin: 2, audienceAgeMax: 6,
      durationSeconds: 14, beatGrid: [0, 2, 4, 6, 8, 10, 12, 14],
      sections: [{ id: 's1', title: 'Intro', type: 'intro', startSeconds: 0, endSeconds: 14, lyricsExcerpt: null, energy: 0.5 }],
      cues: [{ text: 'Hora de comecar', startSeconds: 0, endSeconds: 5 }],
      characters: [{ name: 'Luna', roleName: 'Guia', versionId: 'v1', description: 'Guia' }],
      creative: null,
      existingNarrative: { summary, storyBeats: [{ section: 'Intro', focus: ['Luna'], purpose: 'Abrir a historia' }] }
    });
    expect(result.shots.every((shot) => shot.description !== summary)).toBe(true);
    expect(new Set(result.shots.map((shot) => shot.description)).size).toBe(result.shots.length);
  });

  it('rejects a deterministic allowed/forbidden conflict', () => {
    const service = new ChildrenClipPlanningService();
    const result = service.build({
      title: 'Teste', concept: 'Conceito', visualStyle: '2D', audienceAgeMin: 2, audienceAgeMax: 6,
      durationSeconds: 7, beatGrid: [0, 7],
      sections: [{ id: 's1', title: 'Intro', type: 'intro', startSeconds: 0, endSeconds: 7, lyricsExcerpt: null, energy: 0.5 }],
      cues: [], characters: [{ name: 'A', roleName: null, versionId: 'v1', description: 'A' }],
      creative: { narrative: { storyBeats: [{ section: 'Intro', focus: ['A'] }] } }
    });
    result.shots[0].forbiddenEntityVersionIds.push('v1');
    expect(() => service.validate(result.shots, [{ name: 'A', roleName: null, versionId: 'v1', description: 'A' }], result.narrative))
      .toThrow(/permitida e proibida/);
  });

  it('removes model entity leakage from reusable location and background fields', () => {
    const service = new ChildrenClipPlanningService();
    const result = service.build({
      title: 'Viagem', concept: 'Uma viagem musical', visualStyle: '2D colorido', audienceAgeMin: 2, audienceAgeMax: 6,
      durationSeconds: 7, beatGrid: [0, 7],
      sections: [{ id: 's1', title: 'Intro', type: 'intro', startSeconds: 0, endSeconds: 7, lyricsExcerpt: 'partiu', energy: 0.5 }],
      cues: [], characters: [{ name: 'Lia', roleName: 'Guia', versionId: 'lia-v1', description: 'menina guia' }],
      creative: {
        visualBible: { style: '2D colorido. Lia sempre usa amarelo.', backgroundStyle: 'camadas suaves, Lia no centro' },
        narrative: { storyBeats: [{ section: 'Intro', focus: ['Lia'] }] },
        locations: [{ key: 'estacao', name: 'Estacao', description: 'Lia espera na plataforma. Trilhos entre colinas.', visualPrompt: 'Lia acena, plataforma de madeira' }],
        shotPlans: [{ shotIndex: 0, locationKey: 'estacao', locationDescription: 'Lia entra no trem. Estacao com relogio azul.', allowedEntities: ['Lia'], action: 'Lia acena', composition: 'plano medio com Lia no centro', camera: 'camera acompanha Lia pela plataforma', continuityFromPreviousShot: 'manter Lia no mesmo lado' }]
      }
    });
    expect(result.locations[0].description).toContain('Estacao com relogio azul');
    expect(result.locations[0].description).not.toContain('Lia');
    expect(result.shots[0].backgroundPrompt).not.toMatch(/Lia/i);
    expect(result.shots[0].description).toMatch(/Lia/i);
    expect(result.shots[0].framing).toContain('Lia');
    expect(result.shots[0].cameraMovement).toContain('Lia');
  });
});
