import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VideoWorkflowParams {
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  length: number;
  seed: number;
  filenamePrefix: string;
  referenceImageFilename?: string | null;
}

@Injectable()
export class ComfyUiWorkflowLoaderService {
  private readonly logger = new Logger(ComfyUiWorkflowLoaderService.name);
  private cachedTemplate: string | null = null;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async buildVideoWorkflow(params: VideoWorkflowParams): Promise<Record<string, unknown>> {
    const template = await this.loadTemplate();

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

    const replacements: Record<string, string | number> = {
      unetName,
      clipName,
      clipType,
      vaeName,
      shift,
      fps,
      steps,
      cfg,
      sampler,
      scheduler,
      positivePrompt: params.positivePrompt,
      negativePrompt: params.negativePrompt,
      width: params.width,
      height: params.height,
      length: params.length,
      seed: params.seed,
      filenamePrefix: params.filenamePrefix
    };

    let resolved = template;

    for (const [key, value] of Object.entries(replacements)) {
      const placeholder = `"{{${key}}}"`;
      const replacement = typeof value === 'number' ? String(value) : JSON.stringify(value);
      resolved = resolved.split(placeholder).join(replacement);
    }

    const workflow = JSON.parse(resolved) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    if (params.referenceImageFilename) {
      workflow['56'] = {
        class_type: 'LoadImage',
        inputs: {
          image: params.referenceImageFilename
        }
      };
      workflow['55'].inputs.start_image = ['56', 0];
    }

    this.logger.debug(
      `Built video workflow with params: width=${params.width}, height=${params.height}, ` +
        `length=${params.length}, seed=${params.seed}, unet=${unetName}, ` +
        `referenceImage=${params.referenceImageFilename ? 'yes' : 'no'}`
    );

    return workflow as Record<string, unknown>;
  }

  private async loadTemplate(): Promise<string> {
    if (this.cachedTemplate) {
      return this.cachedTemplate;
    }

    const customPath = this.configService.get<string>('visual.comfyuiWorkflowPath', '');

    const templatePath = customPath
      ? customPath
      : join(__dirname, '..', 'workflows', 'wan-ti2v-api-workflow.json');

    this.logger.log(`Loading ComfyUI workflow template from: ${templatePath}`);

    const content = await readFile(templatePath, 'utf8');
    this.cachedTemplate = content;

    return content;
  }
}
