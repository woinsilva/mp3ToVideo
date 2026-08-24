import { describe, expect, it } from 'vitest';

import { buildMouthFrames } from '../../../packages/children-clip-renderer/src/lip-sync';

describe('children clip lip sync', () => {
  it('maps timed Portuguese vowels to deterministic mouth frames', () => {
    const frames = buildMouthFrames([
      { text: 'Bola', startSeconds: 4, endSeconds: 5 },
      { text: 'azul', startSeconds: 5, endSeconds: 6 }
    ], 16, 4);

    expect(frames.map((frame) => frame.shape)).toEqual(['O', 'A', 'closed', 'A', 'U', 'closed']);
    expect(frames[0]).toMatchObject({ startFrame: 0, endFrame: 8 });
    expect(frames[frames.length - 1].endFrame).toBeGreaterThan(32);
  });

  it('uses a closed mouth for words without vowels', () => {
    expect(buildMouthFrames([{ text: 'shh', startSeconds: 0, endSeconds: 0.5 }], 24))
      .toEqual([
        { startFrame: 0, endFrame: 12, shape: 'closed' },
        { startFrame: 12, endFrame: 13, shape: 'closed' }
      ]);
  });
});
