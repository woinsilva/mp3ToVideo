import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FfmpegCommandBuilderService } from './ffmpeg-command-builder.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class FfmpegRenderingService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(FfmpegCommandBuilderService)
    private readonly ffmpegCommandBuilderService: FfmpegCommandBuilderService
  ) {}

  async createSceneClip(
    outputPath: string,
    durationSeconds: number,
    colorHex: string
  ): Promise<void> {
    const ffmpegPath = this.configService.get<string>('rendering.ffmpegPath', 'ffmpeg');
    const width = this.configService.get<number>('rendering.width', 1280);
    const height = this.configService.get<number>('rendering.height', 720);
    const frameRate = this.configService.get<number>('rendering.frameRate', 24);

    await execFileAsync(
      ffmpegPath,
      this.ffmpegCommandBuilderService.buildSceneClipArgs({
        width,
        height,
        frameRate,
        durationSeconds,
        colorHex,
        outputPath
      })
    );
  }

  async createSceneClipFromImage(
    outputPath: string,
    durationSeconds: number,
    imagePath: string
  ): Promise<void> {
    const ffmpegPath = this.configService.get<string>('rendering.ffmpegPath', 'ffmpeg');
    const width = this.configService.get<number>('rendering.width', 1280);
    const height = this.configService.get<number>('rendering.height', 720);
    const frameRate = this.configService.get<number>('rendering.frameRate', 24);

    await execFileAsync(
      ffmpegPath,
      this.ffmpegCommandBuilderService.buildSceneClipFromImageArgs({
        width,
        height,
        frameRate,
        durationSeconds,
        imagePath,
        outputPath
      })
    );
  }

  async concatSceneClips(inputListPath: string, outputPath: string): Promise<void> {
    const ffmpegPath = this.configService.get<string>('rendering.ffmpegPath', 'ffmpeg');

    await execFileAsync(
      ffmpegPath,
      this.ffmpegCommandBuilderService.buildConcatArgs({
        inputListPath,
        outputPath
      })
    );
  }

  async muxAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    const ffmpegPath = this.configService.get<string>('rendering.ffmpegPath', 'ffmpeg');

    await execFileAsync(
      ffmpegPath,
      this.ffmpegCommandBuilderService.buildMuxAudioArgs({
        videoPath,
        audioPath,
        outputPath
      })
    );
  }
}
