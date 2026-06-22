import { Injectable } from '@nestjs/common';

interface BuildSceneClipCommandInput {
  width: number;
  height: number;
  frameRate: number;
  durationSeconds: number;
  colorHex: string;
  outputPath: string;
}

interface BuildSceneClipFromImageCommandInput {
  width: number;
  height: number;
  frameRate: number;
  durationSeconds: number;
  imagePath: string;
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

  buildSceneClipFromImageArgs(input: BuildSceneClipFromImageCommandInput): string[] {
    return [
      '-y',
      '-loop',
      '1',
      '-i',
      input.imagePath,
      '-vf',
      [
        `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase`,
        `crop=${input.width}:${input.height}`,
        `zoompan=z='min(zoom+0.0008,1.08)':d=${Math.max(1, Math.round(input.durationSeconds * input.frameRate))}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${input.width}x${input.height}:fps=${input.frameRate}`,
        `fps=${input.frameRate},format=yuv420p`
      ].join(','),
      '-t',
      String(input.durationSeconds),
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
