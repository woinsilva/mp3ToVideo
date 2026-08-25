import { execFile } from 'node:child_process';
import { delimiter } from 'node:path';
import { promisify } from 'node:util';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveFromWorkspaceRoot } from '../utils/workspace-path.util';
import { RenderStorageService } from './render-storage.service';
import { GpuLeaseService } from './gpu-lease.service';

const execFileAsync = promisify(execFile);

interface WhisperTranscriptPayload {
  text: string;
  language?: string | null;
  device?: string | null;
  computeType?: string | null;
}

export interface WhisperTranscriptResult {
  rawText: string;
  normalizedText: string;
  language: string | null;
}

@Injectable()
export class WhisperTranscriptionService {
  private readonly logger = new Logger(WhisperTranscriptionService.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(RenderStorageService)
    private readonly renderStorageService: RenderStorageService,
    @Inject(GpuLeaseService)
    private readonly gpu: GpuLeaseService
  ) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('audio.enableWhisper', false);
  }

  async transcribe(audioPath: string): Promise<WhisperTranscriptResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return this.gpu.withLease('whisper', () => this.transcribeWithGpu(audioPath));
  }

  private async transcribeWithGpu(audioPath: string): Promise<WhisperTranscriptResult | null> {
    const pythonPath = this.configService.get<string>('audio.whisperPythonPath', 'python');
    const model = this.configService.get<string>('audio.whisperModel', 'distil-large-v3');
    const device = this.configService.get<string>('audio.whisperDevice', 'cuda');
    const computeType = this.configService.get<string>('audio.whisperComputeType', 'float16');
    const fallbackDevice = this.configService.get<string>('audio.whisperFallbackDevice', 'cpu');
    const fallbackComputeType = this.configService.get<string>(
      'audio.whisperFallbackComputeType',
      'int8'
    );
    const timeoutMs = this.configService.get<number>('audio.whisperTimeoutMs', 600000);
    const language = this.configService.get<string>('audio.whisperLanguage', '');
    const extraPaths = this.configService.get<string>('audio.whisperExtraPaths', '');
    const allowFallbacks = this.configService.get<boolean>('ai.enableFallbacks', true);
    const helperPath = resolveFromWorkspaceRoot(
      'apps/worker/scripts/transcribe_with_faster_whisper.py'
    );

    try {
      const args = [
        helperPath,
        '--audio-path',
        this.renderStorageService.getAbsolutePath(audioPath),
        '--model',
        model,
        '--device',
        device,
        '--compute-type',
        computeType,
        '--fallback-device',
        fallbackDevice,
        '--fallback-compute-type',
        fallbackComputeType
      ];

      if (language.trim()) {
        args.push('--language', language.trim());
      }

      const { stdout } = await execFileAsync(pythonPath, args, {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: this.buildProcessPath(extraPaths),
          HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
        }
      });

      const payload = JSON.parse(stdout.trim()) as WhisperTranscriptPayload;
      const rawText = payload.text?.trim() ?? '';

      if (!rawText) {
        throw new Error('Whisper returned an empty transcript');
      }

      if (
        payload.device?.trim() &&
        payload.computeType?.trim() &&
        (payload.device.trim() !== device || payload.computeType.trim() !== computeType)
      ) {
        this.logger.warn(
          `Whisper retried with device=${payload.device.trim()} computeType=${payload.computeType.trim()} after primary device=${device} computeType=${computeType} was unavailable`
        );
      }

      return {
        rawText,
        normalizedText: this.normalize(rawText),
        language: payload.language?.trim() || null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Whisper error';

      if (!allowFallbacks) {
        throw new Error(`Whisper transcription failed: ${message}`);
      }

      this.logger.warn(`Falling back after Whisper failure: ${message}`);
      return null;
    }
  }

  normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private buildProcessPath(extraPaths: string): string {
    const segments = extraPaths
      .split(';')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return process.env.PATH ?? '';
    }

    return [...segments, process.env.PATH ?? ''].filter(Boolean).join(delimiter);
  }
}
