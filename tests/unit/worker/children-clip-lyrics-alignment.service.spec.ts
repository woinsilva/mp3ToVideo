import { describe, expect, it } from 'vitest';

import { ChildrenClipLyricsAlignmentService } from '../../../apps/worker/src/services/children-clip-lyrics-alignment.service';

describe('ChildrenClipLyricsAlignmentService', () => {
  const service = new ChildrenClipLyricsAlignmentService();

  it('aligns lyric lines and words to a beat grid while ignoring section headers', () => {
    const beats = Array.from({ length: 41 }, (_, index) => index * 0.5);
    const cues = service.align('[Verse]\nO sol nasceu\nVamos brincar\n[Chorus]\nCanta comigo', 20, beats);

    expect(cues).toHaveLength(3);
    expect(cues[0]).toMatchObject({ lineIndex: 0, text: 'O sol nasceu', confidence: 0.65 });
    expect(beats).toContain(cues[0].startSeconds);
    expect(beats).toContain(cues[0].endSeconds);
    expect(cues[0].words).toHaveLength(3);
    expect(cues[2].endSeconds).toBeLessThanOrEqual(20);
  });

  it('returns no cues for lyrics containing only headers', () => {
    expect(service.align('[Intro]\n[Outro]', 10, [])).toEqual([]);
  });
});
