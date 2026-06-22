import { describe, expect, it, vi } from 'vitest';

import { LyricsGenerationService } from '../../../apps/worker/src/services/lyrics-generation.service';
import { LyricsFallbackService } from '../../../apps/worker/src/services/lyrics-fallback.service';

describe('LyricsGenerationService', () => {
  it('uses whisper output when available', async () => {
    const service = new LyricsGenerationService(
      {
        transcribe: vi.fn().mockResolvedValue({
          rawText: 'Hello world',
          normalizedText: 'hello world',
          language: 'en'
        })
      } as never,
      new LyricsFallbackService()
    );

    await expect(service.build('Clip', 'track.mp3')).resolves.toEqual({
      source: 'whisper',
      rawText: 'Hello world',
      normalizedText: 'hello world'
    });
  });

  it('falls back to mock lyrics when whisper is unavailable', async () => {
    const service = new LyricsGenerationService(
      {
        transcribe: vi.fn().mockResolvedValue(null)
      } as never,
      new LyricsFallbackService()
    );

    const result = await service.build('My Clip', 'track.mp3');

    expect(result.source).toBe('mock');
    expect(result.rawText).toContain('My Clip');
    expect(result.normalizedText).toContain('my clip');
  });
});
