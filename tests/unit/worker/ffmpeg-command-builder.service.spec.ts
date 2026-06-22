import { describe, expect, it } from 'vitest';

import { FfmpegCommandBuilderService } from '../../../apps/worker/src/services/ffmpeg-command-builder.service';

describe('FfmpegCommandBuilderService', () => {
  it('builds the scene clip command with color source and mp4 output', () => {
    const service = new FfmpegCommandBuilderService();

    expect(
      service.buildSceneClipArgs({
        width: 1280,
        height: 720,
        frameRate: 24,
        durationSeconds: 6,
        colorHex: '0x355070',
        outputPath: 'C:/tmp/scene-001.mp4'
      })
    ).toEqual([
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x355070:s=1280x720:d=6:r=24',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      'C:/tmp/scene-001.mp4'
    ]);
  });

  it('builds the scene clip command from a generated image', () => {
    const service = new FfmpegCommandBuilderService();

    expect(
      service.buildSceneClipFromImageArgs({
        width: 1280,
        height: 720,
        frameRate: 24,
        durationSeconds: 6,
        imagePath: 'C:/tmp/scene-001.png',
        outputPath: 'C:/tmp/scene-001.mp4'
      })
    ).toEqual([
      '-y',
      '-loop',
      '1',
      '-i',
      'C:/tmp/scene-001.png',
      '-vf',
      "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0008,1.08)':d=144:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=24,fps=24,format=yuv420p",
      '-t',
      '6',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      'C:/tmp/scene-001.mp4'
    ]);
  });

  it('builds concat and mux commands for the final render', () => {
    const service = new FfmpegCommandBuilderService();

    expect(
      service.buildConcatArgs({
        inputListPath: 'C:/tmp/concat-list.txt',
        outputPath: 'C:/tmp/video-track.mp4'
      })
    ).toEqual([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'C:/tmp/concat-list.txt',
      '-c',
      'copy',
      'C:/tmp/video-track.mp4'
    ]);

    expect(
      service.buildMuxAudioArgs({
        videoPath: 'C:/tmp/video-track.mp4',
        audioPath: 'C:/tmp/original.mp3',
        outputPath: 'C:/tmp/final.mp4'
      })
    ).toEqual([
      '-y',
      '-i',
      'C:/tmp/video-track.mp4',
      '-i',
      'C:/tmp/original.mp3',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      'C:/tmp/final.mp4'
    ]);
  });
});
