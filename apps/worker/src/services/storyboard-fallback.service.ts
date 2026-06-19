import { Injectable } from '@nestjs/common';

export interface StoryboardDraft {
  concept: string;
  visualStyle: string;
  mood: string;
  colorPalette: string;
  narrativeSummary: string;
}

@Injectable()
export class StoryboardFallbackService {
  build(projectTitle: string, normalizedLyrics: string): StoryboardDraft {
    const excerpt = normalizedLyrics
      ? normalizedLyrics.slice(0, 120)
      : 'instrumental emotional journey';

    return {
      concept: `A cinematic interpretation of ${projectTitle}`,
      visualStyle: 'cinematic music video',
      mood: 'emotional, dynamic, atmospheric',
      colorPalette: 'deep blue, amber highlights, soft contrast',
      narrativeSummary: `Visual storytelling inspired by ${projectTitle} with motifs drawn from: ${excerpt}.`
    };
  }
}
