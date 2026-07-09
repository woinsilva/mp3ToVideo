import { Injectable } from '@nestjs/common';

import type { PlannedMusicSection } from './music-structure.service';

export interface PlannedScene {
  sectionTitle: string;
  sectionType: string;
  lyricsExcerpt: string | null;
  title: string;
  description: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  sectionIndex: number;
}

@Injectable()
export class ScenePlanningService {
  build(
    totalDurationSeconds: number,
    sections: PlannedMusicSection[],
    narrativeSummary: string,
    targetSceneDurationSeconds?: number | null
  ): PlannedScene[] {
    const sceneDurations = this.buildSceneDurations(
      totalDurationSeconds,
      targetSceneDurationSeconds
    );
    let cursor = 0;

    return sceneDurations.map((sceneDuration, index) => {
      const startSeconds = Number(cursor.toFixed(3));
      const endSeconds = Number((cursor + sceneDuration).toFixed(3));
      const midpoint = startSeconds + sceneDuration / 2;
      const sectionIndex = this.findSectionIndex(sections, midpoint);
      const section = sections[sectionIndex];

      cursor += sceneDuration;

      return {
        sectionTitle: section.title,
        sectionType: section.type,
        lyricsExcerpt: section.lyricsExcerpt,
        title: this.buildSceneTitle(section.title, section.lyricsExcerpt, index),
        description: this.buildSceneDescription(
          narrativeSummary,
          section.title,
          section.lyricsExcerpt
        ),
        startSeconds,
        endSeconds: index === sceneDurations.length - 1 ? Number(totalDurationSeconds.toFixed(3)) : endSeconds,
        durationSeconds: index === sceneDurations.length - 1 ? Number((totalDurationSeconds - startSeconds).toFixed(3)) : sceneDuration,
        sectionIndex
      };
    });
  }

  private buildSceneDurations(
    totalDurationSeconds: number,
    targetSceneDurationSeconds?: number | null
  ): number[] {
    if (totalDurationSeconds <= 4) {
      return [Number(totalDurationSeconds.toFixed(3))];
    }

    const preferredDuration = targetSceneDurationSeconds && targetSceneDurationSeconds > 0
      ? targetSceneDurationSeconds
      : 6;

    if (totalDurationSeconds <= preferredDuration) {
      return [Number(totalDurationSeconds.toFixed(3))];
    }

    const durations: number[] = [];
    let remaining = Number(totalDurationSeconds.toFixed(3));

    while (remaining > preferredDuration) {
      const nextRemaining = Number((remaining - preferredDuration).toFixed(3));

      if (nextRemaining > 0 && nextRemaining < 3) {
        durations.push(Number(remaining.toFixed(3)));
        remaining = 0;
        break;
      }

      durations.push(Number(preferredDuration.toFixed(3)));
      remaining = nextRemaining;
    }

    if (remaining > 0) {
      durations.push(Number(remaining.toFixed(3)));
    }

    return durations;
  }

  private findSectionIndex(sections: PlannedMusicSection[], timepoint: number): number {
    const foundIndex = sections.findIndex(
      (section, index) =>
        timepoint >= section.startSeconds &&
        (timepoint < section.endSeconds || index === sections.length - 1)
    );

    return foundIndex >= 0 ? foundIndex : sections.length - 1;
  }

  private buildSceneTitle(sectionTitle: string, lyricsExcerpt: string | null, index: number): string {
    const lyricCue = this.extractLyricCue(lyricsExcerpt);

    if (!lyricCue) {
      return `${sectionTitle} Scene ${index + 1}`;
    }

    return `${sectionTitle}: ${lyricCue}`;
  }

  private buildSceneDescription(
    narrativeSummary: string,
    sectionTitle: string,
    lyricsExcerpt: string | null
  ): string {
    const lyricCue = lyricsExcerpt?.trim();

    if (!lyricCue) {
      return `${narrativeSummary} Focus on the ${sectionTitle.toLowerCase()} atmosphere.`;
    }

    return [
      `Primary visual driver: "${lyricCue}".`,
      `Build the scene directly from the lyric imagery and emotional meaning of ${sectionTitle}.`,
      `Narrative context: ${narrativeSummary}.`
    ].join(' ');
  }

  private extractLyricCue(lyricsExcerpt: string | null): string | null {
    if (!lyricsExcerpt?.trim()) {
      return null;
    }

    const words = lyricsExcerpt
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6);

    if (words.length === 0) {
      return null;
    }

    return words.join(' ');
  }
}
