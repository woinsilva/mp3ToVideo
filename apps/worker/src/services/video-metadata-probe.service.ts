import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const execFileAsync = promisify(execFile);

export interface ProbedVideoMetadata {
  frameCount: number | null;
  fps: number | null;
  durationSeconds: number | null;
}

@Injectable()
export class VideoMetadataProbeService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async probe(videoPath: string): Promise<ProbedVideoMetadata> {
    const ffprobePath = this.configService.get<string>('audio.ffprobePath', 'ffprobe');
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_frames',
      '-show_entries', 'stream=avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,duration:format=duration',
      '-of', 'json',
      videoPath
    ]);
    const payload = JSON.parse(stdout) as {
      streams?: Array<Record<string, string | undefined>>;
      format?: { duration?: string };
    };
    const stream = payload.streams?.[0] ?? {};

    return {
      frameCount: this.parseInteger(stream.nb_read_frames) ?? this.parseInteger(stream.nb_frames),
      fps: this.parseRate(stream.avg_frame_rate) ?? this.parseRate(stream.r_frame_rate),
      durationSeconds: this.parseNumber(stream.duration) ?? this.parseNumber(payload.format?.duration)
    };
  }

  private parseInteger(value: string | undefined): number | null {
    const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  private parseNumber(value: string | undefined): number | null {
    const parsed = value ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(6)) : null;
  }

  private parseRate(value: string | undefined): number | null {
    if (!value) return null;
    const [numeratorText, denominatorText = '1'] = value.split('/');
    const numerator = Number(numeratorText);
    const denominator = Number(denominatorText);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return Number((numerator / denominator).toFixed(6));
  }
}
