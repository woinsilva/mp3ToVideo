import { describe, expect, it } from 'vitest';

import { ChildrenClipShotPromptService, type ShotPromptContext } from '../../../apps/worker/src/services/children-clip-shot-prompt.service';

const context = (role: ShotPromptContext['role']): ShotPromptContext => ({
  role,
  shot: {
    index: 0,
    description: 'Plano medio na estacao em que Alba sinaliza a partida.',
    purpose: 'Apresentar a partida',
    primaryFocus: 'Alba',
    environment: 'Estacao colorida',
    backgroundPrompt: 'Estacao colorida vazia, plataforma e colinas, manha clara.',
    framing: 'plano medio',
    cameraMovement: 'fixa',
    characterAction: 'Alba sinaliza a partida',
    timeOfDay: 'manha clara',
    continuityFromPreviousShot: null,
    characterVersionIds: ['alba-v1'],
    forbiddenEntityVersionIds: ['futuro-v1'],
    objects: []
    ,backgroundSafeZones: [{ name: 'character-1', xPercent: 30, yPercent: 25, widthPercent: 35, heightPercent: 60 }]
    ,groundingRules: { groundLinePercent: 78, horizonPercent: 42, perspective: 'eye-level' }
  },
  visualBible: { style: '2D colorido', characterRules: [{ name: 'Futuro', identity: 'nao enviar' }] },
  styleProfile: {
    status: 'locked', versionNumber: 2,
    profile: { medium: 'flat 2D cel animation', palette: ['#FFCC00', '#55AAEE'], maxBackgroundDetail: 'simple', characterDetail: { edgeDensity: 0.06 } },
    negativeConstraints: ['busy texture', 'style drift'],
    styleReferenceAssetIds: ['asset-a', 'asset-b']
  },
  narrative: { summary: 'Resumo global da aventura inteira.' },
  entities: [
    { versionId: 'alba-v1', name: 'Alba', type: 'character', identity: 'Guia de roupa amarela', referenceAsset: { id: 'asset-a', storagePath: 'a.png' } },
    { versionId: 'futuro-v1', name: 'Futuro', type: 'character', identity: 'Personagem futuro', referenceAsset: { id: 'asset-b', storagePath: 'b.png' } }
  ]
});

describe('ChildrenClipShotPromptService', () => {
  it('sends references only for explicitly allowed entities', () => {
    const result = new ChildrenClipShotPromptService().build(context('storyboard_frame'));
    expect(result.referenceAssets.map((item) => item.id)).toEqual(['asset-a']);
    expect(result.positivePrompt).toContain('Alba');
    expect(result.positivePrompt).not.toContain('Personagem futuro');
    expect(result.negativePrompt).toContain('Futuro');
  });

  it('builds a background-only prompt with no entity references or character bible', () => {
    const result = new ChildrenClipShotPromptService().build(context('background'));
    expect(result.referenceAssets).toEqual([]);
    expect(result.positivePrompt).not.toContain('Alba');
    expect(result.positivePrompt).not.toContain('Futuro');
    expect(result.positivePrompt).toContain('background plate');
    expect(result.positivePrompt).toContain('project style lock version 2');
    expect(result.positivePrompt).toContain('safe zones');
    expect(result.negativePrompt).toContain('busy texture');
    expect(result.styleReferenceAssetIds).toEqual(['asset-a', 'asset-b']);
  });

  it('uses only an approved location master as background content reference', () => {
    const input = context('background');
    input.shot.location = { masterBackgroundAsset: { id: 'master-bg', storagePath: 'master.png' } };
    const result = new ChildrenClipShotPromptService().build(input);
    expect(result.referenceAssets).toEqual([{ id: 'master-bg', storagePath: 'master.png', purpose: 'location-content' }]);
    expect(result.referenceAssets.some((item) => item.id === 'asset-a')).toBe(false);
  });

  it('refuses background generation without an active style lock', () => {
    expect(() => new ChildrenClipShotPromptService().build({ ...context('background'), styleProfile: null })).toThrow(/Style Lock/);
  });

  it('rejects an entity baked into a background and a copied global summary', () => {
    const service = new ChildrenClipShotPromptService();
    expect(() => service.build({ ...context('background'), customPrompt: 'Alba na estacao' })).toThrow(/Background-only/);
    expect(() => service.build({ ...context('storyboard_frame'), customPrompt: 'Resumo global da aventura inteira.' })).toThrow(/narrativa global/);
  });
});
