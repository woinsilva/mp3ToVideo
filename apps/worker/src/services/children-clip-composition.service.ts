import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RenderStorageService } from './render-storage.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class ChildrenClipCompositionService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RenderStorageService) private readonly storage: RenderStorageService
  ) {}

  async compose(input: {
    projectId: string;
    finalRenderId: string;
    clips: Array<{ path: string; durationSeconds: number }>;
    audioPath: string;
    outputPath: string;
    width: number;
    height: number;
    fps: number;
    totalDuration: number;
    onProgress: (progress: number, stage: string, message: string) => Promise<void>;
  }) {
    const ffmpeg = this.config.get<string>('rendering.ffmpegPath', 'ffmpeg');
    const normalized: string[] = [];
    for (let index = 0; index < input.clips.length; index += 1) {
      const destination = this.storage.buildChildrenClipCompositionTempPath(input.projectId, input.finalRenderId, `normalized-${String(index + 1).padStart(3, '0')}.mp4`);
      const absoluteDestination = await this.storage.ensureParentDirectory(destination);
      await execFileAsync(ffmpeg, [
        '-y', '-i', this.storage.getAbsolutePath(input.clips[index].path), '-t', String(input.clips[index].durationSeconds),
        '-vf', `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2,fps=${input.fps}`,
        '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-video_track_timescale', String(input.fps * 1000), absoluteDestination
      ]);
      normalized.push(destination);
      await input.onProgress(10 + Math.floor(((index + 1) / input.clips.length) * 45), 'COMPOSITING', `Normalizando tomada ${index + 1}/${input.clips.length}.`);
    }
    const concatPath = this.storage.buildChildrenClipCompositionTempPath(input.projectId, input.finalRenderId, 'concat-list.txt');
    const concatAbsolute = await this.storage.writeConcatList(concatPath, normalized);
    const videoPath = this.storage.buildChildrenClipCompositionTempPath(input.projectId, input.finalRenderId, 'video-track.mp4');
    const videoAbsolute = await this.storage.ensureParentDirectory(videoPath);
    await input.onProgress(62, 'COMPOSITING', 'Concatenando tomadas normalizadas.');
    await execFileAsync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concatAbsolute, '-c', 'copy', videoAbsolute]);
    const outputAbsolute = await this.storage.ensureParentDirectory(input.outputPath);
    await input.onProgress(78, 'ENCODING', 'Aplicando a musica original e codificando o arquivo final.');
    await execFileAsync(ffmpeg, [
      '-y', '-i', videoAbsolute, '-i', this.storage.getAbsolutePath(input.audioPath),
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
      '-t', String(input.totalDuration), '-movflags', '+faststart', outputAbsolute
    ]);
  }
}
