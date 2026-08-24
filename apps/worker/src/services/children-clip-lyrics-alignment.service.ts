import { Injectable } from '@nestjs/common';

export interface AlignedLyricCue {
  lineIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  confidence: number;
  words: Array<{ text: string; startSeconds: number; endSeconds: number }>;
}

@Injectable()
export class ChildrenClipLyricsAlignmentService {
  align(rawLyrics: string, durationSeconds: number, beats: number[]): AlignedLyricCue[] {
    const lines = rawLyrics.split(/\r?\n/).map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^\[[^\]]+\]$/.test(line));
    if (lines.length === 0) return [];
    const weights = lines.map((line) => Math.max(1, line.split(/\s+/).length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const usableStart = this.snapToBeat(Math.min(4, durationSeconds * 0.05), beats);
    const usableEnd = Math.max(usableStart + 0.5, durationSeconds - Math.min(3, durationSeconds * 0.04));
    let cursor = usableStart;

    return lines.map((line, lineIndex) => {
      const idealEnd = lineIndex === lines.length - 1
        ? usableEnd
        : cursor + ((usableEnd - usableStart) * weights[lineIndex]) / totalWeight;
      const endSeconds = Math.max(cursor + 0.2, this.snapToBeat(idealEnd, beats));
      const startSeconds = cursor;
      cursor = Math.min(usableEnd, endSeconds);
      const words = this.alignWords(line, startSeconds, endSeconds);
      return {
        lineIndex,
        text: line,
        startSeconds: Number(startSeconds.toFixed(3)),
        endSeconds: Number(Math.min(durationSeconds, endSeconds).toFixed(3)),
        confidence: beats.length > 0 ? 0.65 : 0.4,
        words
      };
    });
  }

  private snapToBeat(time: number, beats: number[]): number {
    if (beats.length === 0) return time;
    let nearest = beats[0];
    for (const beat of beats) {
      if (Math.abs(beat - time) < Math.abs(nearest - time)) nearest = beat;
      if (beat > time && beat - time > 1) break;
    }
    return nearest;
  }

  private alignWords(line: string, start: number, end: number) {
    const words = line.split(/\s+/).filter(Boolean);
    const duration = Math.max(0.1, end - start);
    return words.map((text, index) => ({
      text,
      startSeconds: Number((start + (duration * index) / words.length).toFixed(3)),
      endSeconds: Number((start + (duration * (index + 1)) / words.length).toFixed(3))
    }));
  }
}
