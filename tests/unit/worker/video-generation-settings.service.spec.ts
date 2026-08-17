import { describe, expect, it, vi } from 'vitest';

import {
  calculateWanFrameCount,
  VideoGenerationSettingsService
} from '../../../apps/worker/src/services/video-generation-settings.service';

describe('VideoGenerationSettingsService', () => {
  const values: Record<string, unknown> = {
    'visual.comfyuiVideoWorkflowName': 'wan-2.2-ti2v-5b',
    'visual.comfyuiVideoFps': 16,
    'visual.comfyuiWidth': 1280,
    'visual.comfyuiHeight': 704,
    'visual.comfyuiSteps': 24,
    'visual.comfyuiCfg': 4.5,
    'visual.comfyuiSampler': 'uni_pc',
    'visual.comfyuiScheduler': 'simple',
    'visual.comfyuiVideoUnetName': 'wan2.2_ti2v_5B_fp16.safetensors',
    'visual.comfyuiVideoClipName': 'umt5.safetensors',
    'visual.comfyuiVideoClipType': 'wan',
    'visual.comfyuiVideoVaeName': 'wan2.2_vae.safetensors',
    'visual.comfyuiVideoModelShift': 8
  };

  function createService() {
    return new VideoGenerationSettingsService({
      get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => values[key] ?? defaultValue)
    } as never);
  }

  const prompt = {
    positivePrompt: 'A woman standing naturally in a quiet forest',
    negativePrompt: 'blurry, extra limbs',
    camera: 'dynamic tracking shot'
  } as never;

  it('calculates the exact Wan frame baseline for 2, 3 and 5 seconds at 16 FPS', () => {
    expect(calculateWanFrameCount(2, 16)).toBe(33);
    expect(calculateWanFrameCount(3, 16)).toBe(49);
    expect(calculateWanFrameCount(5, 16)).toBe(81);
  });

  it('uses reproducible overrides and builds a conservative stability profile', () => {
    const result = createService().resolve(prompt, 3, {
      stabilityTest: true,
      seed: 424242,
      cfg: 3.5,
      steps: 28
    });

    expect(result).toMatchObject({
      seed: 424242,
      cfg: 3.5,
      steps: 28,
      fps: 16,
      frameCount: 49,
      requestedDurationSeconds: 3,
      effectiveDurationSeconds: 3
    });
    expect(result.positivePrompt).toContain('locked-off fixed camera');
    expect(result.positivePrompt).toContain('Preserve the subject identity');
    expect(result.negativePrompt).toContain('identity change');
    expect(result.negativePrompt).toContain('background transformation');
    expect(result.negativePrompt.match(/extra limbs/g)).toHaveLength(1);
  });

  it('preserves existing prompts when stability mode is disabled', () => {
    const result = createService().resolve(prompt, 5, { seed: 7 });

    expect(result.positivePrompt).toBe(prompt.positivePrompt);
    expect(result.negativePrompt).toBe(prompt.negativePrompt);
    expect(result.seed).toBe(7);
    expect(result.frameCount).toBe(81);
  });
});
