import { describe, expect, it } from 'vitest';

import { ChildrenClipAudioAnalysisService } from '../../../apps/worker/src/services/children-clip-audio-analysis.service';

describe('ChildrenClipAudioAnalysisService tempo detector', () => {
  it('detects a stable 120 BPM pulse train', () => {
    const service = new ChildrenClipAudioAnalysisService({} as never, {} as never);
    const framesPerSecond = 11_025 / 512;
    const interval = Math.round((framesPerSecond * 60) / 120);
    const onset = Array.from({ length: 600 }, (_, index) => index % interval === 0 ? 1 : 0);
    const tempo = (service as unknown as { estimateTempo(values: number[]): { bpm: number; confidence: number } }).estimateTempo(onset);

    expect(tempo.bpm).toBeGreaterThan(115);
    expect(tempo.bpm).toBeLessThan(125);
    expect(tempo.confidence).toBeGreaterThan(0.5);
  });
});
