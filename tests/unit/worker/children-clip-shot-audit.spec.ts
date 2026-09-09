import { describe, expect, it } from 'vitest';
import { ChildrenClipProcessor } from '../../../apps/worker/src/processors/children-clip.processor';

// Exercise the actual repair/validation boundary without starting services or AI.
const processor = Object.create(ChildrenClipProcessor.prototype) as any;
const schedule = [
  { name: 'Lia', type: 'human', firstShotIndex: 0 },
  { name: 'Pipo Express', type: 'vehicle', identity: 'Trem sem rosto, olhos ou boca', firstShotIndex: 0 },
  { name: 'Lilo', type: 'animal', identity: 'Coelho', firstShotIndex: 21 }
];
const source = {
  shotIndex: 23, locationKey: 'station', locationName: 'Estação Colorida',
  locationDescription: 'Plataforma com faixa de segurança', timeOfDay: 'dia',
  primaryFocus: 'Lilo', allowedEntities: ['Lia', 'Pipo Express', 'Lilo'],
  action: 'Lilo acena na plataforma', purpose: 'Acompanhar a música',
  composition: 'Plano geral da plataforma', camera: 'fixa'
};

describe('shot audit repair boundary', () => {
  it('uses distinct jump choreography when a later lyric repeats the jump and train cues', () => {
    const lyricText = 'Pula, pula! Piuí, lá vai o trem';
    const previous = processor.deterministicSafeShotRepair(source, { index: 23, lyricText }, schedule, []);
    const repaired = processor.deterministicSafeShotRepair(source, { index: 26, lyricText }, schedule, [previous]);
    expect(repaired.action).not.toBe(previous.action);
    expect(processor.shotAuditIssue(repaired, [previous], schedule, 26, lyricText), repaired.action).toBeNull();
  });
  it.each([
    'Piuí... Bem devagar... E agora vai acelerar! Piuí!',
    'Cachorrinho faz... Au, au! Gatinho faz... Miau!',
    'Miau! E o coelho? Pula, pula! Piuí, lá vai o trem',
    'Piuí, eu vou também Bate palma, bate o pé',
    'Au, au! Miau, miau! Pula, pula sem parar! Piuí, até o trem voltar!'
  ])('keeps all lyric requirements when repairing: %s', (lyricText) => {
    const allEntities = [...schedule,
      { name: 'Toto', type: 'animal', identity: 'Cachorro', firstShotIndex: 3 },
      { name: 'Mimi', type: 'animal', identity: 'Gatinha', firstShotIndex: 12 }
    ];
    const repaired = processor.deterministicSafeShotRepair({ ...source, allowedEntities: allEntities.map(x => x.name) }, { index: 30, lyricText }, allEntities, []);
    expect(processor.shotAuditIssue(repaired, [], allEntities, 30, lyricText), repaired.action).toBeNull();
  });
  it('rejects incomplete AI responses before they can be built into shots', () => {
    expect(processor.shotAuditIssue({ ...source, locationName: undefined }, [], schedule, 23, null)).toContain('locationName');
  });
  it('rejects eyes assigned to the approved non-anthropomorphic train', () => {
    expect(processor.shotAuditIssue({ ...source, primaryFocus: 'Pipo Express', action: 'Lia bate palmas enquanto Pipo Express permanece parado ao fundo, com os olhos brilhando de alegria' }, [], schedule, 23, null)).toContain('anatomia');
  });
  it('does not attribute the observing character smile to the train', () => {
    expect(processor.shotAuditIssue({ ...source, primaryFocus: 'Lia', action: 'Lia observa Pipo Express enquanto Lilo acena com um sorriso' }, [], schedule, 23, null)).toBeNull();
  });
  it('accepts the repaired plural jumps and slow departure from shot 24', () => {
    const lyricText = 'Pula, pula, pula, pula Todo mundo vai pular! Agora o trem vai devagar... Piuí...';
    const repaired = processor.deterministicSafeShotRepair(source, { index: 23, lyricText }, schedule, []);
    expect(repaired.action).toContain('dois saltos');
    expect(processor.shotAuditIssue(repaired, [], schedule, 23, lyricText)).toBeNull();
  });
});
