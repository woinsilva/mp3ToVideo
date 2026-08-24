import { randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScenePrompt } from '@prisma/client';

export interface VideoGenerationOverrides {
  seed?: number | null;
  cfg?: number | null;
  steps?: number | null;
  width?: number | null;
  height?: number | null;
  stabilityTest?: boolean;
  imageToVideo?: boolean;
  fps?: number | null;
}

export interface ResolvedVideoGenerationSettings {
  workflowName: string;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  cfg: number;
  steps: number;
  sampler: string;
  scheduler: string;
  width: number;
  height: number;
  fps: number;
  requestedFrameCount: number;
  frameCount: number;
  requestedDurationSeconds: number;
  effectiveDurationSeconds: number;
  unetName: string;
  clipName: string;
  clipType: string;
  vaeName: string;
  modelShift: number;
}

export function calculateWanFrameCount(durationSeconds: number, fps: number): number {
  const requestedFrameCount = Math.max(1, Math.round(durationSeconds * fps));
  return Math.max(1, Math.round((requestedFrameCount - 1) / 4) * 4 + 1);
}

@Injectable()
export class VideoGenerationSettingsService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  resolve(
    prompt: ScenePrompt,
    durationSeconds: number,
    overrides: VideoGenerationOverrides = {}
  ): ResolvedVideoGenerationSettings {
    const fps = overrides.fps ?? this.configService.get<number>('visual.comfyuiVideoFps', 16);
    if (fps !== 16 && fps !== 24) {
      throw new Error(`Unsupported Wan generation FPS: ${fps}. Expected 16 or 24.`);
    }
    const requestedFrameCount = Math.max(1, Math.round(durationSeconds * fps));
    const frameCount = calculateWanFrameCount(durationSeconds, fps);
    const basePrompts = overrides.stabilityTest
      ? this.buildStabilityPrompts(prompt)
      : { positivePrompt: prompt.positivePrompt, negativePrompt: prompt.negativePrompt };
    const resolvedPrompts = overrides.imageToVideo
      ? this.buildImageToVideoPrompts(basePrompts)
      : basePrompts;

    return {
      workflowName: this.configService.get<string>('visual.comfyuiVideoWorkflowName', 'wan-2.2-ti2v-5b'),
      ...resolvedPrompts,
      seed: overrides.seed ?? randomInt(0, 2_147_483_647),
      cfg: overrides.cfg ?? this.configService.get<number>('visual.comfyuiCfg', 5),
      steps: overrides.steps ?? this.configService.get<number>('visual.comfyuiSteps', 20),
      sampler: this.configService.get<string>('visual.comfyuiSampler', 'uni_pc'),
      scheduler: this.configService.get<string>('visual.comfyuiScheduler', 'simple'),
      width: overrides.width ?? this.configService.get<number>('visual.comfyuiWidth', 1024),
      height: overrides.height ?? this.configService.get<number>('visual.comfyuiHeight', 576),
      fps,
      requestedFrameCount,
      frameCount,
      requestedDurationSeconds: durationSeconds,
      effectiveDurationSeconds: Number(((frameCount - 1) / fps).toFixed(6)),
      unetName: this.configService.get<string>('visual.comfyuiVideoUnetName', 'wan2.2_ti2v_5B_fp16.safetensors'),
      clipName: this.configService.get<string>('visual.comfyuiVideoClipName', 'umt5_xxl_fp8_e4m3fn_scaled.safetensors'),
      clipType: this.configService.get<string>('visual.comfyuiVideoClipType', 'wan'),
      vaeName: this.configService.get<string>('visual.comfyuiVideoVaeName', 'wan2.2_vae.safetensors'),
      modelShift: this.configService.get<number>('visual.comfyuiVideoModelShift', 8)
    };
  }

  private buildStabilityPrompts(prompt: ScenePrompt) {
    const positivePrompt = [
      'Stability baseline, single continuous shot: locked-off fixed camera, no camera movement.',
      'Preserve the subject identity, facial features, body proportions, clothing, objects, lighting and background throughout the entire shot.',
      'Only subtle natural movement, realistic physically plausible motion, strong temporal consistency, no scene transformation.',
      `Scene content to preserve: ${prompt.positivePrompt.trim()}`
    ].join(' ');
    const stabilityNegatives = [
      'morphing', 'deformation', 'distorted anatomy', 'extra limbs', 'duplicated subjects',
      'face distortion', 'identity change', 'body proportion change', 'clothing change',
      'background transformation', 'unrealistic movement', 'camera shake', 'camera movement',
      'sudden camera movement', 'scene transition', 'surreal transformation', 'temporal flicker',
      'frame inconsistency'
    ];

    return {
      positivePrompt,
      negativePrompt: this.mergeNegativePrompts(prompt.negativePrompt, stabilityNegatives)
    };
  }

  private buildImageToVideoPrompts(prompts: {
    positivePrompt: string;
    negativePrompt: string;
  }) {
    return {
      positivePrompt: prompts.positivePrompt,
      negativePrompt: this.mergeNegativePrompts(prompts.negativePrompt, [
        'identity change', 'face distortion', 'morphing', 'deformed hands', 'extra fingers',
        'extra limbs', 'duplicated body parts', 'body deformation', 'background transformation',
        'unexpected scene transition', 'surreal transformation', 'sudden camera changes'
      ])
    };
  }

  private mergeNegativePrompts(basePrompt: string, additions: string[]): string {
    const unique = new Map<string, string>();

    for (const value of [...basePrompt.split(','), ...additions]) {
      const normalized = value.trim();
      if (normalized) unique.set(normalized.toLowerCase(), normalized);
    }

    return [...unique.values()].join(', ');
  }
}
