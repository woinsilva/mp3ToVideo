import { Inject, Injectable } from '@nestjs/common';

import { OllamaClientService } from './ollama-client.service';
import {
  StoryboardDraft,
  StoryboardFallbackService
} from './storyboard-fallback.service';

interface StoryboardOllamaResponse {
  concept?: unknown;
  visualStyle?: unknown;
  mood?: unknown;
  colorPalette?: unknown;
  narrativeSummary?: unknown;
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

    const concept = this.normalizeTextField(generated?.concept);
    const visualStyle = this.normalizeTextField(generated?.visualStyle);
    const mood = this.normalizeTextField(generated?.mood);
    const colorPalette = this.normalizeTextField(generated?.colorPalette);
    const narrativeSummary = this.normalizeTextField(generated?.narrativeSummary);

    if (concept && visualStyle && mood && colorPalette && narrativeSummary) {
      return {
        concept,
        visualStyle,
        mood,
        colorPalette,
        narrativeSummary
      };
    }

    return this.storyboardFallbackService.build(projectTitle, normalizedLyrics);
  }

  private normalizeTextField(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized ? normalized : null;
    }

    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.normalizeTextField(item))
        .filter((item): item is string => Boolean(item))
        .join(', ')
        .trim();

      return normalized ? normalized : null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const preferredKeys = ['text', 'value', 'label', 'name', 'summary', 'description'];

      for (const key of preferredKeys) {
        const normalized = this.normalizeTextField(record[key]);

        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  }
}
