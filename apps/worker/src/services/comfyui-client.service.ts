import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ComfyUiWorkflowLoaderService } from './comfyui-workflow-loader.service';

interface ComfyUiPromptResponse {
  prompt_id?: string;
  error?: string;
  node_errors?: Record<string, unknown>;
}

interface ComfyUiOutputAsset {
  filename: string;
  subfolder?: string;
  type?: string;
  format?: string;
}

interface ComfyUiHistoryNodeOutput {
  images?: ComfyUiOutputAsset[];
  videos?: ComfyUiOutputAsset[];
  gifs?: ComfyUiOutputAsset[];
  animated?: ComfyUiOutputAsset[];
}

interface ComfyUiHistoryStatus {
  status_str?: string;
  completed?: boolean;
  messages?: Array<[string, unknown]>;
}

interface ComfyUiHistoryEntry {
  status?: ComfyUiHistoryStatus;
  outputs?: Record<string, ComfyUiHistoryNodeOutput>;
}

export interface GenerateVideoInput {
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  sceneId: string;
}

export interface ComfyUiGenerationResult {
  buffer: Buffer;
  provider: 'comfyui-video' | 'comfyui-image';
}

@Injectable()
export class ComfyUiClientService {
  private readonly logger = new Logger(ComfyUiClientService.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(ComfyUiWorkflowLoaderService)
    private readonly workflowLoaderService: ComfyUiWorkflowLoaderService
  ) {}

  isEnabled(): boolean {
    return this.configService.get<string>('visual.provider', 'procedural') === 'comfyui';
  }

  async generateImage(promptText: string, negativePrompt: string): Promise<ComfyUiGenerationResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const imageFallbackEnabled = this.configService.get<boolean>(
      'visual.comfyuiEnableImageFallback',
      false
    );

    if (!imageFallbackEnabled) {
      this.logger.debug('[ComfyUI Image] Image fallback disabled by COMFYUI_ENABLE_IMAGE_FALLBACK=false');
      return null;
    }

    const checkpointName = this.configService.get<string>('visual.comfyuiCheckpointName', '').trim();

    if (!checkpointName) {
      this.logger.warn(
        '[ComfyUI Image] Image fallback enabled, but COMFYUI_CHECKPOINT_NAME is empty. Skipping image generation.'
      );
      return null;
    }

    const width = this.configService.get<number>('visual.comfyuiWidth', 1024);
    const height = this.configService.get<number>('visual.comfyuiHeight', 576);
    const steps = this.configService.get<number>('visual.comfyuiSteps', 20);
    const cfg = this.configService.get<number>('visual.comfyuiCfg', 5);
    const sampler = this.configService.get<string>('visual.comfyuiSampler', 'uni_pc');
    const scheduler = this.configService.get<string>('visual.comfyuiScheduler', 'simple');

    this.logger.log(
      `[ComfyUI Image] Starting generation: checkpoint=${checkpointName}, ` +
        `size=${width}x${height}, steps=${steps}, cfg=${cfg}`
    );

    try {
      const promptId = await this.submitWorkflow({
        '4': {
          class_type: 'CheckpointLoaderSimple',
          inputs: {
            ckpt_name: checkpointName
          }
        },
        '5': {
          class_type: 'EmptyLatentImage',
          inputs: {
            width,
            height,
            batch_size: 1
          }
        },
        '6': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: promptText,
            clip: ['4', 1]
          }
        },
        '7': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: negativePrompt,
            clip: ['4', 1]
          }
        },
        '3': {
          class_type: 'KSampler',
          inputs: {
            seed: this.randomSeed(),
            steps,
            cfg,
            sampler_name: sampler,
            scheduler,
            denoise: 1,
            model: ['4', 0],
            positive: ['6', 0],
            negative: ['7', 0],
            latent_image: ['5', 0]
          }
        },
        '8': {
          class_type: 'VAEDecode',
          inputs: {
            samples: ['3', 0],
            vae: ['4', 2]
          }
        },
        '9': {
          class_type: 'SaveImage',
          inputs: {
            filename_prefix: `video-saas/${Date.now()}-image`,
            images: ['8', 0]
          }
        }
      });

      this.logger.log(`[ComfyUI Image] Workflow submitted, prompt_id=${promptId}. Polling for result...`);

      const historyEntry = await this.waitForHistory(promptId);
      const image = this.extractOutputAsset(historyEntry, ['images']);

      if (!image) {
        throw new Error('ComfyUI did not return an image output');
      }

      this.logger.log(`[ComfyUI Image] Success: received image ${image.filename}`);

      return {
        buffer: await this.downloadAsset(image),
        provider: 'comfyui-image'
      };
    } catch (error) {
      return this.handleFailure(error, 'image generation');
    }
  }

  async generateVideo(input: GenerateVideoInput): Promise<ComfyUiGenerationResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const fps = this.configService.get<number>('visual.comfyuiVideoFps', 24);
    const length = Math.max(1, Math.round(input.durationSeconds * fps) + 1);

    this.logger.log(
      `[ComfyUI Video] Starting generation for scene=${input.sceneId}: ` +
        `size=${input.width}x${input.height}, duration=${input.durationSeconds}s, ` +
        `frames=${length}, fps=${fps}`
    );

    try {
      const workflow = await this.workflowLoaderService.buildVideoWorkflow({
        positivePrompt: input.positivePrompt,
        negativePrompt: input.negativePrompt,
        width: input.width,
        height: input.height,
        length,
        seed: this.randomSeed(),
        filenamePrefix: `video/scene-${input.sceneId}`
      });

      const promptId = await this.submitWorkflow(workflow);

      this.logger.log(
        `[ComfyUI Video] Workflow submitted for scene=${input.sceneId}, prompt_id=${promptId}. Polling for result...`
      );

      const historyEntry = await this.waitForHistory(promptId);
      const video = this.extractOutputAsset(historyEntry, ['videos', 'animated', 'gifs']);

      if (!video) {
        throw new Error('ComfyUI did not return a video output after successful execution');
      }

      this.logger.log(
        `[ComfyUI Video] Success for scene=${input.sceneId}: received video ${video.filename}`
      );

      return {
        buffer: await this.downloadAsset(video),
        provider: 'comfyui-video'
      };
    } catch (error) {
      return this.handleFailure(error, `video generation for scene=${input.sceneId}`);
    }
  }

  private async submitWorkflow(prompt: Record<string, unknown>): Promise<string> {
    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const clientId = `video-saas-${Date.now()}`;

    this.logger.debug(`[ComfyUI] Submitting workflow to ${baseUrl}/prompt (client_id=${clientId})`);

    let promptResponse: Response;

    try {
      promptResponse = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          prompt
        })
      });
    } catch (networkError) {
      const message = networkError instanceof Error ? networkError.message : String(networkError);
      throw new Error(
        `ComfyUI unreachable at ${baseUrl}/prompt: ${message}. ` +
          `Is ComfyUI running? Check COMFYUI_BASE_URL in .env`
      );
    }

    if (!promptResponse.ok) {
      let errorBody = '';

      try {
        errorBody = await promptResponse.text();
      } catch {
        errorBody = '(could not read response body)';
      }

      this.logger.error(
        `[ComfyUI] /prompt failed: status=${promptResponse.status}, body=${errorBody}`
      );
      throw new Error(
        `ComfyUI /prompt failed with status ${promptResponse.status}: ${errorBody}`
      );
    }

    const promptPayload = (await promptResponse.json()) as ComfyUiPromptResponse;

    if (promptPayload.error) {
      this.logger.error(
        `[ComfyUI] /prompt returned error: ${promptPayload.error}, ` +
          `node_errors=${JSON.stringify(promptPayload.node_errors)}`
      );
      throw new Error(
        `ComfyUI workflow rejected: ${promptPayload.error}`
      );
    }

    const promptId = promptPayload.prompt_id?.trim();

    if (!promptId) {
      throw new Error('ComfyUI did not return a prompt_id');
    }

    return promptId;
  }

  private async waitForHistory(promptId: string): Promise<ComfyUiHistoryEntry> {
    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const timeoutMs = this.configService.get<number>('visual.comfyuiTimeoutMs', 1200000);
    const pollIntervalMs = this.configService.get<number>('visual.comfyuiPollIntervalMs', 3000);
    const deadline = Date.now() + timeoutMs;
    let pollCount = 0;

    while (Date.now() < deadline) {
      await this.sleep(pollIntervalMs);
      pollCount++;

      let historyResponse: Response;

      try {
        historyResponse = await fetch(`${baseUrl}/history/${promptId}`);
      } catch {
        this.logger.warn(
          `[ComfyUI] Poll #${pollCount}: Could not reach history endpoint, retrying...`
        );
        continue;
      }

      if (!historyResponse.ok) {
        continue;
      }

      const historyPayload = (await historyResponse.json()) as Record<string, ComfyUiHistoryEntry>;
      const historyEntry = historyPayload[promptId];

      if (!historyEntry) {
        if (pollCount % 10 === 0) {
          this.logger.debug(
            `[ComfyUI] Poll #${pollCount}: Job ${promptId} not yet in history, still waiting...`
          );
        }
        continue;
      }

      // Check for execution errors in the ComfyUI status
      if (historyEntry.status?.status_str === 'error') {
        const errorMessages = (historyEntry.status.messages ?? [])
          .map((msg) => {
            if (Array.isArray(msg) && msg.length >= 2) {
              return `${msg[0]}: ${JSON.stringify(msg[1])}`;
            }
            return JSON.stringify(msg);
          })
          .join('; ');

        this.logger.error(
          `[ComfyUI] Execution failed for prompt_id=${promptId}: ${errorMessages}`
        );
        throw new Error(`ComfyUI execution failed: ${errorMessages}`);
      }

      if (historyEntry.outputs) {
        this.logger.debug(
          `[ComfyUI] Poll #${pollCount}: Job ${promptId} completed. ` +
            `Output nodes: ${Object.keys(historyEntry.outputs).join(', ')}`
        );
        return historyEntry;
      }
    }

    const elapsedSec = Math.round(timeoutMs / 1000);
    throw new Error(
      `ComfyUI generation timed out after ${elapsedSec}s (${Math.round(timeoutMs / pollIntervalMs)} polls) for prompt_id=${promptId}`
    );
  }

  private extractOutputAsset(
    entry: ComfyUiHistoryEntry,
    preferredKinds: Array<'images' | 'videos' | 'gifs' | 'animated'>
  ): ComfyUiOutputAsset | null {
    if (!entry.outputs) {
      return null;
    }

    for (const [nodeId, output] of Object.entries(entry.outputs)) {
      for (const kind of preferredKinds) {
        const asset = output[kind]?.[0];

        if (asset?.filename) {
          this.logger.debug(
            `[ComfyUI] Found output asset: node=${nodeId}, kind=${kind}, filename=${asset.filename}`
          );
          return asset;
        }
      }
    }

    this.logger.warn(
      `[ComfyUI] No output asset found. Available output nodes: ` +
        `${JSON.stringify(
          Object.fromEntries(
            Object.entries(entry.outputs).map(([nodeId, output]) => [
              nodeId,
              Object.keys(output).filter(
                (k) => Array.isArray((output as Record<string, unknown>)[k])
              )
            ])
          )
        )}`
    );

    return null;
  }

  private async downloadAsset(asset: ComfyUiOutputAsset): Promise<Buffer> {
    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const imageUrl = new URL(`${baseUrl}/view`);
    imageUrl.searchParams.set('filename', asset.filename);
    imageUrl.searchParams.set('subfolder', asset.subfolder ?? '');
    imageUrl.searchParams.set('type', asset.type ?? 'output');

    try {
      const response = await fetch(imageUrl);

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        this.logger.debug(
          `[ComfyUI] Downloaded asset ${asset.filename} via HTTP: ${buffer.length} bytes`
        );
        return buffer;
      }

      this.logger.warn(
        `[ComfyUI] HTTP download failed (status=${response.status}), trying filesystem fallback...`
      );
    } catch (httpError) {
      this.logger.warn(
        `[ComfyUI] HTTP download error: ${httpError instanceof Error ? httpError.message : httpError}, trying filesystem fallback...`
      );
    }

    const outputHostPath = this.configService.get<string>(
      'visual.comfyuiOutputHostPath',
      './storage/comfyui/output'
    );
    const fallbackPath = join(outputHostPath, asset.subfolder ?? '', asset.filename);
    this.logger.log(`[ComfyUI] Reading asset from filesystem: ${fallbackPath}`);

    return readFile(fallbackPath);
  }

  private handleFailure(error: unknown, operation: string): ComfyUiGenerationResult | null {
    const message = error instanceof Error ? error.message : `Unknown ComfyUI ${operation} error`;
    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      `[ComfyUI] ${operation} FAILED: ${message}${stack ? `\nStack: ${stack}` : ''}`
    );

    throw new Error(`ComfyUI ${operation} failed: ${message}`);
  }

  private randomSeed(): number {
    return Math.floor(Math.random() * 2_147_483_647);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
    });
  }
}
