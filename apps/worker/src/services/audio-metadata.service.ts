import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const execFileAsync = promisify(execFile);

@Injectable()
export class AudioMetadataService {
  private readonly logger = new Logger(AudioMetadataService.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async resolveDurationSeconds(trackPath: string): Promise<number> {
    const absoluteTrackPath = resolve(trackPath);
    const ffprobePath = this.configService.get<string>('audio.ffprobePath', 'ffprobe');
    const fallbackDuration = this.configService.get<number>('audio.mockDurationSeconds', 30);
    const allowFallbacks = this.configService.get<boolean>('ai.enableFallbacks', true);

    try {
      const { stdout } = await execFileAsync(ffprobePath, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        absoluteTrackPath
      ]);
      const parsedDuration = Number.parseFloat(stdout.trim());

      if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
        return Number(parsedDuration.toFixed(3));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ffprobe error';
      this.logger.warn(`Falling back to mock audio duration for ${absoluteTrackPath}: ${message}`);
    }

    if (!allowFallbacks) {
      throw new Error('Unable to resolve audio duration without fallback support');
    }

    return fallbackDuration;
  }
}
