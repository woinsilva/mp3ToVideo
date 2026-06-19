import { Injectable } from '@nestjs/common';

interface BuildSceneClipCommandInput {
  width: number;
  height: number;
  frameRate: number;
  durationSeconds: number;
  colorHex: string;
  outputPath: string;
}

interface BuildConcatCommandInput {
  inputListPath: string;
  outputPath: string;
}

interface BuildMuxAudioCommandInput {
  videoPath: string;
  audioPath: string;
  outputPath: string;
}

@Injectable()
export class FfmpegCommandBuilderService {
  buildSceneClipArgs(input: BuildSceneClipCommandInput): string[] {
    return [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${input.colorHex}:s=${input.width}x${input.height}:d=${input.durationSeconds}:r=${input.frameRate}`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      input.outputPath
    ];
  }

  buildConcatArgs(input: BuildConcatCommandInput): string[] {
    return [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      input.inputListPath,
      '-c',
      'copy',
      input.outputPath
    ];
  }

  buildMuxAudioArgs(input: BuildMuxAudioCommandInput): string[] {
    return [
      '-y',
      '-i',
      input.videoPath,
      '-i',
      input.audioPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      input.outputPath
    ];
  }
}
