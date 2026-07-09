import { describe, expect, it } from 'vitest';

import { MusicStructureService } from '../../../apps/worker/src/services/music-structure.service';

describe('MusicStructureService', () => {
  it('builds short-track sections that cover the full duration', () => {
    const service = new MusicStructureService();

    const sections = service.build(30, 'one two three four five six seven eight');

    expect(sections).toHaveLength(4);
    expect(sections[0].type).toBe('intro');
    expect(sections[1].type).toBe('verse');
    expect(sections[2].type).toBe('chorus');
    expect(sections[3].type).toBe('outro');
    expect(sections[0].startSeconds).toBe(0);
    expect(sections.at(-1)?.endSeconds).toBe(30);
    expect(
      Number(
        sections.reduce((sum, section) => sum + (section.endSeconds - section.startSeconds), 0).toFixed(3)
      )
    ).toBe(30);
  });

  it('builds long-track sections including bridge and final chorus', () => {
    const service = new MusicStructureService();

    const sections = service.build(96, 'alpha beta gamma delta epsilon zeta eta theta iota kappa');

    expect(sections).toHaveLength(8);
    expect(sections.map((section) => section.title)).toEqual([
      'Intro',
      'Verse 1',
      'Chorus 1',
      'Verse 2',
      'Chorus 2',
      'Bridge',
      'Final Chorus',
      'Outro'
    ]);
    expect(sections.at(-1)?.endSeconds).toBe(96);
  });

  it('respects explicit lyric block headers for manual lyrics timing', () => {
    const service = new MusicStructureService();

    const sections = service.build(
      120,
      [
        '[Verse 1]',
        'Hoje o celular vibrou diferente',
        'Mensagem do banco dizendo caiu',
        '[Pre-Chorus]',
        'Bota o som no carro',
        '[Chorus]',
        'Caiu o salario, hoje eu vou gastar',
        'Cerveja gelada ate o sol raiar',
        '[Bridge]',
        'Segunda a gente volta pra luta',
        '[Final Chorus]',
        'Que a festa acabou de comecar'
      ].join('\n')
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Verse 1',
      'Pre-chorus',
      'Chorus',
      'Bridge',
      'Final Chorus'
    ]);
    expect(sections.map((section) => section.type)).toEqual([
      'verse',
      'verse',
      'chorus',
      'bridge',
      'chorus'
    ]);
    expect(sections[0]?.lyricsExcerpt).toContain('Hoje o celular vibrou diferente');
    expect(sections[2]?.lyricsExcerpt).toContain('Caiu o salario, hoje eu vou gastar');
    expect(sections.at(-1)?.endSeconds).toBe(120);
    expect(sections[2]!.endSeconds - sections[2]!.startSeconds).toBeGreaterThan(
      sections[1]!.endSeconds - sections[1]!.startSeconds
    );
  });
});
