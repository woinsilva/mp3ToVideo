import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ComfyUiGenerationResult, ComfyUiHeartbeat } from './comfyui-client.service';
import { ComfyUiClientService } from './comfyui-client.service';
import { SnapGenClientService } from './snapgen-client.service';
import type { ResolvedVideoGenerationSettings } from './video-generation-settings.service';

export interface SceneVideoInput extends ResolvedVideoGenerationSettings {
  sceneId: string;
  provider?: 'comfyui' | 'snapgen'; // 'comfyui' is default
  snapGenSettings?: {
    model: 'veo-3.1-fast';
    resolution: '720p' | '1080p';
    durationSeconds: 8;
    aspectRatio: '16:9' | '9:16';
    modeImage: 'frame' | 'ingredient';
    referenceImagePaths: string[];
  };
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  referenceImagePath?: string | null;
  onSubmitted?: (promptId: string) => Promise<void>;
  onHeartbeat?: (heartbeat: ComfyUiHeartbeat & { statusPercentage?: number; estimatedCredit?: number; usedCredit?: number; externalStatus?: number }) => Promise<void>;
  shouldCancel?: () => Promise<boolean>;
  onGpuWaiting?: (owner: string | null) => Promise<void>;
}

export interface SceneVideoResult {
  buffer: Buffer;
  provider: 'comfyui-video' | 'snapgen';
  metadata?: Record<string, unknown>;
  lastFrame?: { buffer: Buffer; mimeType: string };
}

@Injectable()
export class SceneVideoGenerationService {
  private readonly logger = new Logger(SceneVideoGenerationService.name);

  constructor(
    @Inject(ComfyUiClientService)
    private readonly comfyUiClientService: ComfyUiClientService,
    @Inject(SnapGenClientService)
    private readonly snapGenClientService: SnapGenClientService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async generate(input: SceneVideoInput): Promise<SceneVideoResult | null> {
    const provider = input.provider || 'comfyui';

    if (provider === 'snapgen') {
      return this.generateWithSnapGen(input);
    }

    return this.generateWithComfyUi(input);
  }

  private async generateWithComfyUi(input: SceneVideoInput): Promise<SceneVideoResult | null> {
    const result: ComfyUiGenerationResult | null =
      await this.comfyUiClientService.generateVideo({
        sceneId: input.sceneId,
        positivePrompt: input.positivePrompt,
        negativePrompt: input.negativePrompt,
        width: input.width,
        height: input.height,
        durationSeconds: input.durationSeconds,
        frameCount: input.frameCount,
        fps: input.fps,
        seed: input.seed,
        steps: input.steps,
        cfg: input.cfg,
        sampler: input.sampler,
        scheduler: input.scheduler,
        unetName: input.unetName,
        clipName: input.clipName,
        clipType: input.clipType,
        vaeName: input.vaeName,
        modelShift: input.modelShift,
        referenceImagePath: input.referenceImagePath,
        onSubmitted: input.onSubmitted,
        onHeartbeat: input.onHeartbeat,
        shouldCancel: input.shouldCancel,
        onGpuWaiting: input.onGpuWaiting
      });

    if (!result) {
      return null;
    }

    return {
      buffer: result.buffer,
      provider: 'comfyui-video'
    };
  }

  private async generateWithSnapGen(input: SceneVideoInput): Promise<SceneVideoResult | null> {
    const settings = input.snapGenSettings;
    if (!settings) {
      throw new Error('snapGenSettings are required when provider is snapgen');
    }

    return this.snapGenClientService.withGenerationSlot(async () => {
      this.logger.log(`Submitting scene ${input.sceneId} to SnapGen API`);
      const submitResult = await this.snapGenClientService.submitVideoGeneration({
        model: settings.model, resolution: settings.resolution, duration: settings.durationSeconds,
        aspect_ratio: settings.aspectRatio, mode_image: settings.modeImage,
        prompt: input.positivePrompt, ref_images: settings.referenceImagePaths
      });
      await input.onSubmitted?.(submitResult.uuid);
      const startedAt = Date.now();
      const pollIntervalMs = this.config.get<number>('snapgen.pollIntervalMs', 10_000);
      const timeoutMs = this.config.get<number>('snapgen.timeoutMs', 900_000);
      let pollCount = 0;
      await input.onHeartbeat?.({ promptId: submitResult.uuid, state: 'waiting', pollCount, elapsedMs: 0, estimatedCredit: submitResult.estimated_credit, externalStatus: submitResult.status ?? 0 });
      for (;;) {
        if (await input.shouldCancel?.()) return null;
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs > timeoutMs) throw new Error(`SnapGen excedeu o limite de ${Math.round(timeoutMs / 60_000)} minutos`);
        const history = await this.snapGenClientService.getHistory(submitResult.uuid);
        await input.onHeartbeat?.({
          promptId: submitResult.uuid, state: history.status === 0 ? 'waiting' : 'history_seen', pollCount, elapsedMs,
          statusPercentage: history.status_percentage, estimatedCredit: submitResult.estimated_credit,
          usedCredit: history.used_credit, externalStatus: history.status
        });
        if (history.status === 2) {
          const output = history.generated_video?.[0];
          if (!output?.video_url) throw new Error('SnapGen concluiu o job sem fornecer o video');
          const downloadStartedAt = Date.now();
          const video = await this.snapGenClientService.download(output.video_url);
          const downloadDurationMs = Date.now() - downloadStartedAt;
          let lastFrame: Awaited<ReturnType<SnapGenClientService['download']>> | undefined;
          if (history.last_frame_url) {
            try { lastFrame = await this.snapGenClientService.download(history.last_frame_url); }
            catch (error) { this.logger.warn(`Video SnapGen ${submitResult.uuid} concluido, mas o ultimo frame nao pode ser baixado: ${error instanceof Error ? error.message : String(error)}`); }
          }
          return {
            buffer: video.buffer, provider: 'snapgen', lastFrame,
            metadata: {
              externalJobId: submitResult.uuid, model: submitResult.model_name ?? settings.model,
              estimatedCredit: submitResult.estimated_credit ?? null, usedCredit: history.used_credit ?? null,
              externalDurationSeconds: output.duration ?? null, externalAspectRatio: output.aspect_ratio ?? null,
              externalResolution: output.resolution ?? null, hasWatermark: output.has_watermark ?? null,
              downloadDurationMs, elapsedMs: Date.now() - startedAt
            }
          };
        }
        if (![0, 1].includes(history.status)) throw new Error(`SnapGen falhou (status ${history.status})${history.status_desc ? `: ${history.status_desc}` : ''}`);
        pollCount++;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    });
  }
}
