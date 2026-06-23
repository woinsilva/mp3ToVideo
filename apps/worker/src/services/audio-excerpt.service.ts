import { Inject, Injectable } from '@nestjs/common';

import { FfmpegRenderingService } from './ffmpeg-rendering.service';
import { RenderStorageService } from './render-storage.service';

@Injectable()
export class AudioExcerptService {
  constructor(
    @Inject(RenderStorageService)
    private readonly renderStorageService: RenderStorageService,
    @Inject(FfmpegRenderingService)
    private readonly ffmpegRenderingService: FfmpegRenderingService
  ) {}

  async buildInitialExcerpt(
    projectId: string,
    sourceAudioPath: string,
    durationSeconds: number
  ): Promise<string> {
    const trimmedAudioPath = this.renderStorageService.buildTrimmedAudioPath(
      projectId,
      sourceAudioPath
    );
    const trimmedAudioAbsolutePath =
      await this.renderStorageService.ensureParentDirectory(trimmedAudioPath);

    await this.ffmpegRenderingService.trimAudio(
      this.renderStorageService.getAbsolutePath(sourceAudioPath),
      durationSeconds,
      trimmedAudioAbsolutePath
    );

    return trimmedAudioPath;
  }
}
