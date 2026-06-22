import { Inject, Injectable } from '@nestjs/common';
import { LyricsSource } from '@prisma/client';

import { LyricsFallbackService } from './lyrics-fallback.service';
import { WhisperTranscriptionService } from './whisper-transcription.service';

export interface LyricsGenerationResult {
  source: LyricsSource;
  rawText: string;
  normalizedText: string;
}

@Injectable()
export class LyricsGenerationService {
  constructor(
    @Inject(WhisperTranscriptionService)
    private readonly whisperTranscriptionService: WhisperTranscriptionService,
    @Inject(LyricsFallbackService)
    private readonly lyricsFallbackService: LyricsFallbackService
  ) {}

  async build(projectTitle: string, audioPath: string): Promise<LyricsGenerationResult> {
    const whisperTranscript = await this.whisperTranscriptionService.transcribe(audioPath);

    if (whisperTranscript) {
      return {
        source: LyricsSource.whisper,
        rawText: whisperTranscript.rawText,
        normalizedText: whisperTranscript.normalizedText
      };
    }

    return {
      source: LyricsSource.mock,
      ...this.lyricsFallbackService.build(projectTitle)
    };
  }
}
