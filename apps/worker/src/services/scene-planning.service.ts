import { Injectable } from '@nestjs/common';

import type { PlannedMusicSection } from './music-structure.service';

export interface PlannedScene {
  sectionTitle: string;
  sectionType: string;
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
    narrativeSummary: string
  ): PlannedScene[] {
    const sceneDurations = this.buildSceneDurations(totalDurationSeconds);
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
        title: `${section.title} Scene ${index + 1}`,
        description: `${narrativeSummary} Focus on the ${section.title.toLowerCase()} atmosphere.`,
        startSeconds,
        endSeconds: index === sceneDurations.length - 1 ? Number(totalDurationSeconds.toFixed(3)) : endSeconds,
        durationSeconds: index === sceneDurations.length - 1 ? Number((totalDurationSeconds - startSeconds).toFixed(3)) : sceneDuration,
        sectionIndex
      };
    });
  }

  private buildSceneDurations(totalDurationSeconds: number): number[] {
    if (totalDurationSeconds <= 4) {
      return [Number(totalDurationSeconds.toFixed(3))];
    }

    const minimumSceneCount = Math.ceil(totalDurationSeconds / 10);
    const maximumSceneCount = Math.max(minimumSceneCount, Math.floor(totalDurationSeconds / 4));
    const preferredSceneCount = Math.ceil(totalDurationSeconds / 6);
    const sceneCount = Math.min(
      maximumSceneCount,
      Math.max(minimumSceneCount, preferredSceneCount)
    );
    const baseDuration = Number((totalDurationSeconds / sceneCount).toFixed(3));
    const durations = Array.from({ length: sceneCount }, () => baseDuration);
    const allocated = durations.reduce((sum, value) => sum + value, 0);
    const adjustment = Number((totalDurationSeconds - allocated).toFixed(3));

    durations[durations.length - 1] = Number((durations[durations.length - 1] + adjustment).toFixed(3));

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
}
