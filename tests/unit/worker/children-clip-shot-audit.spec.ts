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
  it('rejects incomplete AI responses before they can be built into shots', () => {
    expect(processor.shotAuditIssue({ ...source, locationName: undefined }, [], schedule, 23, null)).toContain('locationName');
  });
  it('rejects eyes assigned to the approved non-anthropomorphic train', () => {
    expect(processor.shotAuditIssue({ ...source, primaryFocus: 'Pipo Express', action: 'Lia bate palmas enquanto Pipo Express permanece parado ao fundo, com os olhos brilhando de alegria' }, [], schedule, 23, null)).toContain('anatomia');
  });
  it('accepts the repaired plural jumps and slow departure from shot 24', () => {
    const lyricText = 'Pula, pula, pula, pula Todo mundo vai pular! Agora o trem vai devagar... Piuí...';
    const repaired = processor.deterministicSafeShotRepair(source, { index: 23, lyricText }, schedule, []);
    expect(repaired.action).toContain('dois saltos');
    expect(processor.shotAuditIssue(repaired, [], schedule, 23, lyricText)).toBeNull();
  });
});
