import { describe, expect, it, vi } from 'vitest';

import { StoryboardGenerationService } from '../../../apps/worker/src/services/storyboard-generation.service';
import { StoryboardFallbackService } from '../../../apps/worker/src/services/storyboard-fallback.service';

describe('StoryboardGenerationService', () => {
  it('normalizes non-string fields returned by ollama', async () => {
    const ollamaClientService = {
      generateJson: vi.fn().mockResolvedValue({
        concept: ' Neon western journey ',
        visualStyle: {
          text: ' cinematic realism '
        },
        mood: ['moody', 'restless'],
        colorPalette: ['deep blue', 'amber glow'],
        narrativeSummary: {
          summary: 'A lone rider crosses the city at dusk.'
        }
      })
    } as never;
    const fallbackService = new StoryboardFallbackService();

    const service = new StoryboardGenerationService(ollamaClientService, fallbackService);

    await expect(service.build('Clip', 'Lyrics')).resolves.toEqual({
      concept: 'Neon western journey',
      visualStyle: 'cinematic realism',
      mood: 'moody, restless',
      colorPalette: 'deep blue, amber glow',
      narrativeSummary: 'A lone rider crosses the city at dusk.'
    });
  });

  it('falls back when the ollama payload is incomplete after normalization', async () => {
    const ollamaClientService = {
      generateJson: vi.fn().mockResolvedValue({
        concept: 'Only concept',
        visualStyle: null,
        mood: null,
        colorPalette: ['deep blue'],
        narrativeSummary: null
      })
    } as never;
    const fallbackService = new StoryboardFallbackService();

    const service = new StoryboardGenerationService(ollamaClientService, fallbackService);
    const fallback = fallbackService.build('Clip', 'Lyrics');

    await expect(service.build('Clip', 'Lyrics')).resolves.toEqual(fallback);
  });
});
