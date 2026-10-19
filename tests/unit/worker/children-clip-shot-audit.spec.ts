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
  it('varies repeated clap-and-foot choruses with a distinct staged event', () => {
    const lyricText = 'Bate palma, bate o pe. Piui, la vai o trem';
    const previous = [
      'Lia bate duas palmas e depois pisa com um pe na marca do chao pela esquerda',
      'Lia alterna uma palma e um toque dos pes no piso ao centro',
      'Lia bate palmas na altura dos ombros e toca o chao com a ponta do pe pela direita',
      'Lia acompanha o pulso com palmas baixas e dois passos dos pes sobre marcas no piso pela esquerda',
      'Lia toca primeiro o pe na marca do chao e depois bate uma palma ao centro',
      'Lia bate palmas enquanto alterna os pes entre dois circulos no chao pela direita',
      'Lia faz duas palmas cruzadas e pisa na estrela pintada no piso pela esquerda',
      'Lia bate uma palma, toca o pe no chao e congela em pose ao centro'
    ].map((action, shotIndex) => ({ ...source, shotIndex, action }));
    const repaired = processor.deterministicSafeShotRepair(source, { index: 17, lyricText }, schedule, previous);
    expect(processor.shotAuditIssue(repaired, previous, schedule, 17, lyricText), repaired.action).toBeNull();
  });
  it('continues a lyric split after boarding without boarding twice', () => {
    const entities = [
      ...schedule,
      { name: 'Mimi', type: 'animal', identity: 'Gatinha', firstShotIndex: 12 }
    ];
    const previous = { ...source, shotIndex: 12, primaryFocus: 'Mimi', allowedEntities: ['Lia', 'Pipo Express', 'Mimi'], action: 'Mimi entra pela porta do Pipo Express parado na plataforma' };
    const lyricText = 'Pulou dentro do vagao. E o nosso amigo gatinho! Miau!';
    const repaired = processor.deterministicSafeShotRepair({ ...source, primaryFocus: 'Mimi', allowedEntities: ['Lia', 'Pipo Express', 'Mimi'] }, { index: 13, lyricText }, entities, [previous]);
    expect(repaired.action).toMatch(/dentro do vagao/);
    expect(repaired.action).not.toMatch(/\bentra\b/);
    expect(processor.shotAuditIssue(repaired, [previous], entities, 13, lyricText), repaired.action).toBeNull();
  });
  it('normalizes a single location object returned instead of an array', () => {
    const normalized = processor.normalizeCreativePlanResponse({
      locations: { key: 'station', name: 'Estacao', description: 'Plataforma', timeOfDay: 'dia' },
      shotPlans: source
    });
    expect(normalized.locations).toHaveLength(1);
    expect(normalized.shotPlans).toHaveLength(1);
  });
  it('moves focus from a stationary background train to the acting character', () => {
    const lyricText = 'Bate palma, bate o pe';
    const repaired = processor.deterministicSafeShotRepair({ ...source, primaryFocus: 'Pipo Express' }, { index: 10, lyricText }, schedule, []);
    expect(repaired.primaryFocus).toBe('Lia');
    expect(processor.shotAuditIssue(repaired, [], schedule, 10, lyricText), repaired.action).toBeNull();
  });
  it('finds a distinct late boarding beat after earlier boarding scenes', () => {
    const lyricText = 'Tem bichinho, vem, vem, vem! Um, dois, tres, pode embarcar no trenzinho';
    const earlierBoarding = [
      'Lia entra pela porta lateral de Pipo Express, parado na plataforma, enquanto Lilo acena da area segura',
      'Pipo Express, parado na plataforma, abre a porta e Lia sobe pelo degrau iluminado enquanto Lilo espera atras da faixa',
      'Lia mostra o bilhete ilustrado e atravessa a porta aberta de Pipo Express, parado na plataforma, seguido por Lilo'
    ].map((action, shotIndex) => ({ ...source, shotIndex, action }));
    const previous = [...earlierBoarding, { ...source, shotIndex: 29, action: 'Pipo Express passa diante do moinho enquanto Lia aponta o caminho' }];
    const repaired = processor.deterministicSafeShotRepair(source, { index: 30, lyricText }, schedule, previous);
    expect(earlierBoarding.every((item) => item.action !== repaired.action)).toBe(true);
    expect(processor.shotAuditIssue(repaired, previous, schedule, 30, lyricText), repaired.action).toBeNull();
  });
  it('uses distinct jump choreography when a later lyric repeats the jump and train cues', () => {
    const lyricText = 'Pula, pula! Piuí, lá vai o trem';
    const previous = processor.deterministicSafeShotRepair(source, { index: 23, lyricText }, schedule, []);
    const repaired = processor.deterministicSafeShotRepair(source, { index: 26, lyricText }, schedule, [previous]);
    expect(repaired.action).not.toBe(previous.action);
    expect(processor.shotAuditIssue(repaired, [previous], schedule, 26, lyricText), repaired.action).toBeNull();
  });
  it('shows the train returning in the final repeated jump cue', () => {
    const entities = [...schedule,
      { name: 'Toto', type: 'animal', identity: 'Cachorro', firstShotIndex: 3 },
      { name: 'Mimi', type: 'animal', identity: 'Gatinha', firstShotIndex: 12 }
    ];
    const lyricText = 'Au, au! Miau, miau! Pula sem parar! Ate o trem voltar!';
    const repaired = processor.deterministicSafeShotRepair({ ...source, allowedEntities: entities.map(x => x.name) }, { index: 31, lyricText }, entities, []);
    expect(repaired.action).toMatch(/retorna|reaparece|volta|chega/);
    expect(processor.shotAuditIssue(repaired, [], entities, 31, lyricText), repaired.action).toBeNull();
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
