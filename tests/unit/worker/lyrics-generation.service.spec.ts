import { describe, expect, it, vi } from 'vitest';

import { LyricsGenerationService } from '../../../apps/worker/src/services/lyrics-generation.service';

describe('LyricsGenerationService', () => {
  it('uses whisper output when available', async () => {
    const service = new LyricsGenerationService(
      {
        transcribe: vi.fn().mockResolvedValue({
          rawText: 'Hello world',
          normalizedText: 'hello world',
          language: 'en'
        })
      } as never
    );

    await expect(service.build('Clip', 'track.mp3')).resolves.toEqual({
      source: 'whisper',
      rawText: 'Hello world',
      normalizedText: 'hello world'
    });
  });

  it('fails explicitly when whisper is unavailable', async () => {
    const service = new LyricsGenerationService(
      {
        transcribe: vi.fn().mockResolvedValue(null)
      } as never
    );

    await expect(service.build('My Clip', 'track.mp3')).rejects.toThrow(
      'Lyrics could not be generated for "My Clip". Configure Whisper correctly or provide manual lyrics.'
    );
  });
});
