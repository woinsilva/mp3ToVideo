import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ComfyUiPromptResponse {
  prompt_id?: string;
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

interface ComfyUiHistoryEntry {
  outputs?: Record<string, ComfyUiHistoryNodeOutput>;
}

interface GenerateVideoInput {
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  sceneId: string;
}

@Injectable()
export class ComfyUiClientService {
  private readonly logger = new Logger(ComfyUiClientService.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  isEnabled(): boolean {
    return this.configService.get<string>('visual.provider', 'procedural') === 'comfyui';
  }

  async generateImage(promptText: string, negativePrompt: string): Promise<Buffer | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const checkpointName = this.configService.get<string>(
      'visual.comfyuiCheckpointName',
      'sd_xl_turbo_1.0.safetensors'
    );
    const width = this.configService.get<number>('visual.comfyuiWidth', 1024);
    const height = this.configService.get<number>('visual.comfyuiHeight', 576);
    const steps = this.configService.get<number>('visual.comfyuiSteps', 20);
    const cfg = this.configService.get<number>('visual.comfyuiCfg', 5);
    const sampler = this.configService.get<string>('visual.comfyuiSampler', 'uni_pc');
    const scheduler = this.configService.get<string>('visual.comfyuiScheduler', 'simple');

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

      const historyEntry = await this.waitForHistory(promptId);
      const image = this.extractOutputAsset(historyEntry, ['images']);

      if (!image) {
        throw new Error('ComfyUI did not return an image output');
      }

      return await this.downloadAsset(image);
    } catch (error) {
      return this.handleFailure(error, 'image generation');
    }
  }

  async generateVideo(input: GenerateVideoInput): Promise<Buffer | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const unetName = this.configService.get<string>(
      'visual.comfyuiVideoUnetName',
      'wan2.2_ti2v_5B_fp16.safetensors'
    );
    const clipName = this.configService.get<string>(
      'visual.comfyuiVideoClipName',
      'umt5_xxl_fp8_e4m3fn_scaled.safetensors'
    );
    const clipType = this.configService.get<string>('visual.comfyuiVideoClipType', 'wan');
    const vaeName = this.configService.get<string>(
      'visual.comfyuiVideoVaeName',
      'wan2.2_vae.safetensors'
    );
    const shift = this.configService.get<number>('visual.comfyuiVideoModelShift', 8);
    const fps = this.configService.get<number>('visual.comfyuiVideoFps', 24);
    const steps = this.configService.get<number>('visual.comfyuiSteps', 20);
    const cfg = this.configService.get<number>('visual.comfyuiCfg', 5);
    const sampler = this.configService.get<string>('visual.comfyuiSampler', 'uni_pc');
    const scheduler = this.configService.get<string>('visual.comfyuiScheduler', 'simple');
    const length = Math.max(1, Math.round(input.durationSeconds * fps) + 1);

    try {
      const promptId = await this.submitWorkflow({
        '3': {
          class_type: 'KSampler',
          inputs: {
            seed: this.randomSeed(),
            steps,
            cfg,
            sampler_name: sampler,
            scheduler,
            denoise: 1,
            model: ['48', 0],
            positive: ['6', 0],
            negative: ['7', 0],
            latent_image: ['55', 0]
          }
        },
        '6': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: input.positivePrompt,
            clip: ['38', 0]
          }
        },
        '7': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: input.negativePrompt,
            clip: ['38', 0]
          }
        },
        '8': {
          class_type: 'VAEDecode',
          inputs: {
            samples: ['3', 0],
            vae: ['39', 0]
          }
        },
        '37': {
          class_type: 'UNETLoader',
          inputs: {
            unet_name: unetName,
            weight_dtype: 'default'
          }
        },
        '38': {
          class_type: 'CLIPLoader',
          inputs: {
            clip_name: clipName,
            type: clipType,
            device: 'default'
          }
        },
        '39': {
          class_type: 'VAELoader',
          inputs: {
            vae_name: vaeName
          }
        },
        '48': {
          class_type: 'ModelSamplingSD3',
          inputs: {
            shift,
            model: ['37', 0]
          }
        },
        '55': {
          class_type: 'Wan22ImageToVideoLatent',
          inputs: {
            width: input.width,
            height: input.height,
            length,
            batch_size: 1,
            vae: ['39', 0]
          }
        },
        '57': {
          class_type: 'CreateVideo',
          inputs: {
            fps,
            bit_depth: 8,
            images: ['8', 0]
          }
        },
        '58': {
          class_type: 'SaveVideo',
          inputs: {
            filename_prefix: `video/scene-${input.sceneId}`,
            format: 'auto',
            codec: 'auto',
            video: ['57', 0]
          }
        }
      });

      const historyEntry = await this.waitForHistory(promptId);
      const video = this.extractOutputAsset(historyEntry, ['videos', 'animated', 'gifs']);

      if (!video) {
        throw new Error('ComfyUI did not return a video output');
      }

      return await this.downloadAsset(video);
    } catch (error) {
      return this.handleFailure(error, 'video generation');
    }
  }

  private async submitWorkflow(prompt: Record<string, unknown>): Promise<string> {
    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const clientId = `video-saas-${Date.now()}`;
    const promptResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        prompt
      })
    });

    if (!promptResponse.ok) {
      throw new Error(`ComfyUI /prompt failed with status ${promptResponse.status}`);
    }

    const promptPayload = (await promptResponse.json()) as ComfyUiPromptResponse;
    const promptId = promptPayload.prompt_id?.trim();

    if (!promptId) {
      throw new Error('ComfyUI did not return a prompt_id');
    }

    return promptId;
  }

  private async waitForHistory(promptId: string): Promise<ComfyUiHistoryEntry> {
    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const timeoutMs = this.configService.get<number>('visual.comfyuiTimeoutMs', 300000);
    const pollIntervalMs = this.configService.get<number>('visual.comfyuiPollIntervalMs', 3000);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await this.sleep(pollIntervalMs);

      const historyResponse = await fetch(`${baseUrl}/history/${promptId}`);

      if (!historyResponse.ok) {
        continue;
      }

      const historyPayload = (await historyResponse.json()) as Record<string, ComfyUiHistoryEntry>;
      const historyEntry = historyPayload[promptId];

      if (historyEntry?.outputs) {
        return historyEntry;
      }
    }

    throw new Error('ComfyUI generation timed out');
  }

  private extractOutputAsset(
    entry: ComfyUiHistoryEntry,
    preferredKinds: Array<'images' | 'videos' | 'gifs' | 'animated'>
  ): ComfyUiOutputAsset | null {
    if (!entry.outputs) {
      return null;
    }

    for (const output of Object.values(entry.outputs)) {
      for (const kind of preferredKinds) {
        const asset = output[kind]?.[0];

        if (asset?.filename) {
          return asset;
        }
      }
    }

    return null;
  }

  private async downloadAsset(asset: ComfyUiOutputAsset): Promise<Buffer> {
    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const imageUrl = new URL(`${baseUrl}/view`);
    imageUrl.searchParams.set('filename', asset.filename);
    imageUrl.searchParams.set('subfolder', asset.subfolder ?? '');
    imageUrl.searchParams.set('type', asset.type ?? 'output');

    const response = await fetch(imageUrl);

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    const outputHostPath = this.configService.get<string>(
      'visual.comfyuiOutputHostPath',
      './storage/comfyui/output'
    );
    const fallbackPath = join(outputHostPath, asset.subfolder ?? '', asset.filename);

    return readFile(fallbackPath);
  }

  private handleFailure(error: unknown, operation: string): Buffer | null {
    const message = error instanceof Error ? error.message : `Unknown ComfyUI ${operation} error`;
    const allowFallbacks = this.configService.get<boolean>('ai.enableFallbacks', true);

    if (!allowFallbacks) {
      throw new Error(`ComfyUI ${operation} failed: ${message}`);
    }

    this.logger.warn(`Falling back after ComfyUI ${operation} failure: ${message}`);
    return null;
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
