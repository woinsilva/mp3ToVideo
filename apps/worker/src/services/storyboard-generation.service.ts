import { Inject, Injectable } from '@nestjs/common';

import { OllamaClientService } from './ollama-client.service';
import {
  StoryboardDraft,
  StoryboardFallbackService
} from './storyboard-fallback.service';

interface StoryboardOllamaResponse {
  concept?: string;
  visualStyle?: string;
  mood?: string;
  colorPalette?: string;
  narrativeSummary?: string;
}

@Injectable()
export class StoryboardGenerationService {
  constructor(
    @Inject(OllamaClientService)
    private readonly ollamaClientService: OllamaClientService,
    @Inject(StoryboardFallbackService)
    private readonly storyboardFallbackService: StoryboardFallbackService
  ) {}

  async build(projectTitle: string, normalizedLyrics: string): Promise<StoryboardDraft> {
    const generated = await this.ollamaClientService.generateJson<StoryboardOllamaResponse>([
      {
        role: 'system',
        content: [
          'You are a music video storyboard generator.',
          'Return only valid JSON.',
          'Use these exact keys: concept, visualStyle, mood, colorPalette, narrativeSummary.',
          'Keep the output concise, cinematic, and production-oriented.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          projectTitle,
          normalizedLyrics
        })
      }
    ]);

    if (
      generated?.concept &&
      generated.visualStyle &&
      generated.mood &&
      generated.colorPalette &&
      generated.narrativeSummary
    ) {
      return {
        concept: generated.concept.trim(),
        visualStyle: generated.visualStyle.trim(),
        mood: generated.mood.trim(),
        colorPalette: generated.colorPalette.trim(),
        narrativeSummary: generated.narrativeSummary.trim()
      };
    }

    return this.storyboardFallbackService.build(projectTitle, normalizedLyrics);
  }
}
