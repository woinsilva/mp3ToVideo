import { Injectable } from '@nestjs/common';
import { MusicSectionType } from '@prisma/client';

interface StructureTemplateItem {
  type: MusicSectionType;
  title: string;
  weight: number;
}

interface ParsedLyricsBlock {
  type: MusicSectionType;
  title: string;
  lines: string[];
  excerpt: string | null;
  weight: number;
}

export interface PlannedMusicSection {
  type: MusicSectionType;
  title: string;
  startSeconds: number;
  endSeconds: number;
  lyricsExcerpt: string | null;
  energy: number;
}

@Injectable()
export class MusicStructureService {
  build(
    durationSeconds: number,
    rawLyrics: string,
    normalizedLyrics = ''
  ): PlannedMusicSection[] {
    const parsedBlocks = this.parseStructuredLyrics(rawLyrics);

    if (parsedBlocks.length > 0) {
      return this.buildFromParsedBlocks(durationSeconds, parsedBlocks);
    }

    const templates = this.selectTemplate(durationSeconds);
    const durations = this.allocateDurations(durationSeconds, templates.map((item) => item.weight));
    const lyricChunks = this.splitLyrics(rawLyrics, normalizedLyrics, templates.length);

    let cursor = 0;

    return templates.map((item, index) => {
      const startSeconds = Number(cursor.toFixed(3));
      const sectionDuration = durations[index];
      const endSeconds = Number((cursor + sectionDuration).toFixed(3));

      cursor += sectionDuration;

      return {
        type: item.type,
        title: item.title,
        startSeconds,
        endSeconds: index === templates.length - 1 ? Number(durationSeconds.toFixed(3)) : endSeconds,
        lyricsExcerpt: lyricChunks[index] ?? null,
        energy: this.resolveEnergy(item.type)
      };
    });
  }

  private buildFromParsedBlocks(
    durationSeconds: number,
    blocks: ParsedLyricsBlock[]
  ): PlannedMusicSection[] {
    const durations = this.allocateDurations(
      durationSeconds,
      blocks.map((block) => block.weight)
    );
    let cursor = 0;

    return blocks.map((block, index) => {
      const startSeconds = Number(cursor.toFixed(3));
      const sectionDuration = durations[index];
      const endSeconds = Number((cursor + sectionDuration).toFixed(3));

      cursor += sectionDuration;

      return {
        type: block.type,
        title: block.title,
        startSeconds,
        endSeconds: index === blocks.length - 1 ? Number(durationSeconds.toFixed(3)) : endSeconds,
        lyricsExcerpt: block.excerpt,
        energy: this.resolveEnergy(block.type)
      };
    });
  }

  private selectTemplate(durationSeconds: number): StructureTemplateItem[] {
    if (durationSeconds < 45) {
      return [
        { type: MusicSectionType.intro, title: 'Intro', weight: 0.14 },
        { type: MusicSectionType.verse, title: 'Verse 1', weight: 0.36 },
        { type: MusicSectionType.chorus, title: 'Chorus 1', weight: 0.3 },
        { type: MusicSectionType.outro, title: 'Outro', weight: 0.2 }
      ];
    }

    return [
      { type: MusicSectionType.intro, title: 'Intro', weight: 0.08 },
      { type: MusicSectionType.verse, title: 'Verse 1', weight: 0.17 },
      { type: MusicSectionType.chorus, title: 'Chorus 1', weight: 0.13 },
      { type: MusicSectionType.verse, title: 'Verse 2', weight: 0.17 },
      { type: MusicSectionType.chorus, title: 'Chorus 2', weight: 0.13 },
      { type: MusicSectionType.bridge, title: 'Bridge', weight: 0.12 },
      { type: MusicSectionType.chorus, title: 'Final Chorus', weight: 0.12 },
      { type: MusicSectionType.outro, title: 'Outro', weight: 0.08 }
    ];
  }

  private allocateDurations(totalDuration: number, weights: number[]): number[] {
    const sectionCount = weights.length;
    const minimumPerSection = totalDuration >= sectionCount * 4 ? 4 : 0;
    const remaining = Math.max(0, totalDuration - minimumPerSection * sectionCount);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    const durations = weights.map((weight) =>
      Number((minimumPerSection + (remaining * weight) / totalWeight).toFixed(3))
    );

    const allocated = durations.reduce((sum, value) => sum + value, 0);
    const adjustment = Number((totalDuration - allocated).toFixed(3));

    durations[durations.length - 1] = Number((durations[durations.length - 1] + adjustment).toFixed(3));

    return durations;
  }

  private splitLyrics(rawLyrics: string, normalizedLyrics: string, chunkCount: number): string[] {
    const lineBasedChunks = this.splitRawLyricsByLines(rawLyrics, chunkCount);

    if (lineBasedChunks.length > 0) {
      return lineBasedChunks;
    }

    if (!normalizedLyrics) {
      return [];
    }

    const words = normalizedLyrics.split(' ').filter(Boolean);

    if (words.length === 0) {
      return [];
    }

    const chunkSize = Math.max(1, Math.ceil(words.length / chunkCount));
    const chunks: string[] = [];

    for (let index = 0; index < words.length; index += chunkSize) {
      chunks.push(words.slice(index, index + chunkSize).join(' '));
    }

    while (chunks.length < chunkCount) {
      chunks.push(chunks[chunks.length - 1] ?? '');
    }

    return chunks.slice(0, chunkCount);
  }

  private splitRawLyricsByLines(rawLyrics: string, chunkCount: number): string[] {
    if (!rawLyrics.trim()) {
      return [];
    }

    const lines = rawLyrics
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^\[[^\]]+\]$/.test(line));

    if (lines.length === 0) {
      return [];
    }

    const chunkSize = Math.max(1, Math.ceil(lines.length / chunkCount));
    const chunks: string[] = [];

    for (let index = 0; index < lines.length; index += chunkSize) {
      chunks.push(lines.slice(index, index + chunkSize).join(' '));
    }

    while (chunks.length < chunkCount) {
      chunks.push(chunks[chunks.length - 1] ?? '');
    }

    return chunks.slice(0, chunkCount);
  }

  private parseStructuredLyrics(rawLyrics: string): ParsedLyricsBlock[] {
    if (!rawLyrics.trim()) {
      return [];
    }

    const lines = rawLyrics
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const blocks: ParsedLyricsBlock[] = [];
    let currentHeader: string | null = null;
    let currentLines: string[] = [];

    const flushCurrentBlock = () => {
      if (!currentHeader || currentLines.length === 0) {
        currentHeader = null;
        currentLines = [];
        return;
      }

      const mapped = this.mapHeaderToSection(currentHeader);

      blocks.push({
        type: mapped.type,
        title: mapped.title,
        lines: [...currentLines],
        excerpt: currentLines.join(' ').trim() || null,
        weight: this.computeLyricsWeight(currentLines)
      });

      currentHeader = null;
      currentLines = [];
    };

    for (const line of lines) {
      const headerMatch = line.match(/^\[([^\]]+)\]$/);

      if (headerMatch) {
        flushCurrentBlock();
        currentHeader = headerMatch[1].trim();
        continue;
      }

      if (!currentHeader) {
        return [];
      }

      currentLines.push(line);
    }

    flushCurrentBlock();

    return blocks;
  }

  private mapHeaderToSection(header: string): { type: MusicSectionType; title: string } {
    const normalizedHeader = header.toLowerCase();

    if (normalizedHeader.includes('intro')) {
      return { type: MusicSectionType.intro, title: 'Intro' };
    }

    if (normalizedHeader.includes('pre-chorus') || normalizedHeader.includes('pre chorus')) {
      return { type: MusicSectionType.verse, title: this.toDisplayTitle(header) };
    }

    if (normalizedHeader.includes('chorus') || normalizedHeader.includes('refr')) {
      return { type: MusicSectionType.chorus, title: this.toDisplayTitle(header) };
    }

    if (normalizedHeader.includes('bridge') || normalizedHeader.includes('ponte')) {
      return { type: MusicSectionType.bridge, title: this.toDisplayTitle(header) };
    }

    if (normalizedHeader.includes('outro') || normalizedHeader.includes('final')) {
      return { type: MusicSectionType.outro, title: this.toDisplayTitle(header) };
    }

    if (normalizedHeader.includes('instrumental')) {
      return { type: MusicSectionType.instrumental, title: this.toDisplayTitle(header) };
    }

    if (normalizedHeader.includes('verse') || normalizedHeader.includes('verso')) {
      return { type: MusicSectionType.verse, title: this.toDisplayTitle(header) };
    }

    return { type: MusicSectionType.verse, title: this.toDisplayTitle(header) };
  }

  private toDisplayTitle(header: string): string {
    return header
      .split(/\s+/)
      .map((segment) => {
        if (/^\d+$/.test(segment)) {
          return segment;
        }

        return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
      })
      .join(' ');
  }

  private computeLyricsWeight(lines: string[]): number {
    const wordCount = lines
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;

    return Math.max(lines.length, wordCount, 1);
  }

  private resolveEnergy(type: MusicSectionType): number {
    switch (type) {
      case MusicSectionType.intro:
        return 0.35;
      case MusicSectionType.verse:
        return 0.55;
      case MusicSectionType.chorus:
        return 0.85;
      case MusicSectionType.bridge:
        return 0.7;
      case MusicSectionType.outro:
        return 0.45;
      case MusicSectionType.instrumental:
      default:
        return 0.5;
    }
  }
}
