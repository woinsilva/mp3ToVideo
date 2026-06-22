import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ComfyUiPromptResponse {
  prompt_id?: string;
}

interface ComfyUiHistoryImage {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyUiHistoryNodeOutput {
  images?: ComfyUiHistoryImage[];
}

interface ComfyUiHistoryEntry {
  outputs?: Record<string, ComfyUiHistoryNodeOutput>;
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

    const baseUrl = this.configService.get<string>('visual.comfyuiBaseUrl', 'http://localhost:8188');
    const timeoutMs = this.configService.get<number>('visual.comfyuiTimeoutMs', 300000);
    const pollIntervalMs = this.configService.get<number>('visual.comfyuiPollIntervalMs', 3000);
    const checkpointName = this.configService.get<string>(
      'visual.comfyuiCheckpointName',
      'sd_xl_turbo_1.0.safetensors'
    );
    const width = this.configService.get<number>('visual.comfyuiWidth', 1024);
    const height = this.configService.get<number>('visual.comfyuiHeight', 576);
    const steps = this.configService.get<number>('visual.comfyuiSteps', 8);
    const cfg = this.configService.get<number>('visual.comfyuiCfg', 1.8);
    const sampler = this.configService.get<string>('visual.comfyuiSampler', 'euler');
    const scheduler = this.configService.get<string>('visual.comfyuiScheduler', 'normal');
    const allowFallbacks = this.configService.get<boolean>('ai.enableFallbacks', true);

    try {
      const clientId = `video-saas-${Date.now()}`;
      const promptResponse = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          prompt: {
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
                seed: Math.floor(Math.random() * 2_147_483_647),
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
                filename_prefix: `video-saas-${Date.now()}`,
                images: ['8', 0]
              }
            }
          }
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

      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        await this.sleep(pollIntervalMs);

        const historyResponse = await fetch(`${baseUrl}/history/${promptId}`);

        if (!historyResponse.ok) {
          continue;
        }

        const historyPayload = (await historyResponse.json()) as Record<string, ComfyUiHistoryEntry>;
        const image = this.extractImage(historyPayload[promptId]);

        if (!image) {
          continue;
        }

        const imageUrl = new URL(`${baseUrl}/view`);
        imageUrl.searchParams.set('filename', image.filename);
        imageUrl.searchParams.set('subfolder', image.subfolder ?? '');
        imageUrl.searchParams.set('type', image.type ?? 'output');

        const imageResponse = await fetch(imageUrl);

        if (!imageResponse.ok) {
          throw new Error(`ComfyUI /view failed with status ${imageResponse.status}`);
        }

        return Buffer.from(await imageResponse.arrayBuffer());
      }

      throw new Error('ComfyUI image generation timed out');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ComfyUI error';

      if (!allowFallbacks) {
        throw new Error(`ComfyUI image generation failed: ${message}`);
      }

      this.logger.warn(`Falling back after ComfyUI failure: ${message}`);
      return null;
    }
  }

  private extractImage(entry?: ComfyUiHistoryEntry): ComfyUiHistoryImage | null {
    if (!entry?.outputs) {
      return null;
    }

    for (const output of Object.values(entry.outputs)) {
      const image = output.images?.[0];

      if (image?.filename) {
        return image;
      }
    }

    return null;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
    });
  }
}
