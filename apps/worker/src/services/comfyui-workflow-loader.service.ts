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
  fps: number;
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  unetName: string;
  clipName: string;
  clipType: string;
  vaeName: string;
  modelShift: number;
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

    const replacements: Record<string, string | number> = {
      unetName: params.unetName,
      clipName: params.clipName,
      clipType: params.clipType,
      vaeName: params.vaeName,
      shift: params.modelShift,
      fps: params.fps,
      steps: params.steps,
      cfg: params.cfg,
      sampler: params.sampler,
      scheduler: params.scheduler,
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
        `length=${params.length}, seed=${params.seed}, unet=${params.unetName}, ` +
        `fps=${params.fps}, steps=${params.steps}, cfg=${params.cfg}, ` +
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
