import { describe, expect, it } from 'vitest';

import { FrameInterpolationService } from '../../../apps/worker/src/services/frame-interpolation.service';

describe('FrameInterpolationService', () => {
  const config = {
    get(key: string, fallback: unknown) {
      const values: Record<string, unknown> = {
        'interpolation.rifeModelPath': 'C:/rife/rife-v4.6',
        'interpolation.gpuId': 0,
        'interpolation.preset': 'slow',
        'interpolation.crf': 17
      };
      return values[key] ?? fallback;
    }
  };
  const service = new FrameInterpolationService(
    {} as never,
    config as never,
    {} as never,
    {} as never
  );

  it('asks RIFE itself for exactly 2N-1 frames on Vulkan GPU 0', () => {
    const args = service.buildRifeArguments('input', 'output', 81);
    expect(args).toContain('-n');
    expect(args[args.indexOf('-n') + 1]).toBe('161');
    expect(args[args.indexOf('-g') + 1]).toBe('0');
  });

  it('encodes the inferred frames at 2x FPS and stream-copies optional audio', () => {
    const args = service.buildEncodeArguments('frames', 'original.mp4', 'rife.mp4', 32);
    expect(args[args.indexOf('-framerate') + 1]).toBe('32');
    expect(args).toContain('1:a?');
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
    expect(args).not.toContain('minterpolate');
  });
});
