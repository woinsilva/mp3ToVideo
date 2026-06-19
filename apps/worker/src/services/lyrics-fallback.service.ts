import { Injectable } from '@nestjs/common';

@Injectable()
export class LyricsFallbackService {
  build(projectTitle: string): { rawText: string; normalizedText: string } {
    const rawText = [
      `[Intro] ${projectTitle}`,
      `This is a placeholder lyric track for ${projectTitle}.`,
      'Generated locally while the MVP pipeline is still in mock mode.'
    ].join('\n');

    return {
      rawText,
      normalizedText: this.normalize(rawText)
    };
  }

  normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }
}
