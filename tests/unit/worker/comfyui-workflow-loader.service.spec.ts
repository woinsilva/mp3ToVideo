import { describe, expect, it, vi } from 'vitest';

import { ComfyUiWorkflowLoaderService } from '../../../apps/worker/src/services/comfyui-workflow-loader.service';

describe('ComfyUiWorkflowLoaderService', () => {
  const generationParameters = {
    fps: 16,
    steps: 24,
    cfg: 4.5,
    sampler: 'uni_pc',
    scheduler: 'simple',
    unetName: 'wan-unet.safetensors',
    clipName: 'wan-clip.safetensors',
    clipType: 'wan',
    vaeName: 'wan-vae.safetensors',
    modelShift: 8
  };
  function createService() {
    const configService = {
      get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'visual.comfyuiVideoUnetName') return 'wan-unet.safetensors';
        if (key === 'visual.comfyuiVideoClipName') return 'wan-clip.safetensors';
        if (key === 'visual.comfyuiVideoClipType') return 'wan';
        if (key === 'visual.comfyuiVideoVaeName') return 'wan-vae.safetensors';
        if (key === 'visual.comfyuiVideoModelShift') return 8;
        if (key === 'visual.comfyuiVideoFps') return 24;
        if (key === 'visual.comfyuiSteps') return 20;
        if (key === 'visual.comfyuiCfg') return 5;
        if (key === 'visual.comfyuiSampler') return 'uni_pc';
        if (key === 'visual.comfyuiScheduler') return 'simple';
        if (key === 'visual.comfyuiWorkflowPath') return '';
        return defaultValue;
      })
    } as never;

    return new ComfyUiWorkflowLoaderService(configService);
  }

  it('loads and parameterizes the workflow JSON', async () => {
    const service = createService();

    const workflow = await service.buildVideoWorkflow({
      positivePrompt: 'A beautiful sunset',
      negativePrompt: 'blurry, dark',
      width: 1280,
      height: 704,
      length: 121,
      seed: 123456789,
      ...generationParameters,
      filenamePrefix: 'test-video'
    });

    expect(workflow['37'].inputs.unet_name).toBe('wan-unet.safetensors');
    expect(workflow['6'].inputs.text).toBe('A beautiful sunset');
    expect(workflow['7'].inputs.text).toBe('blurry, dark');
    expect(workflow['55'].inputs.width).toBe(1280);
    expect(workflow['55'].inputs.height).toBe(704);
    expect(workflow['55'].inputs.length).toBe(121);
    expect(workflow['3'].inputs.seed).toBe(123456789);
    expect(workflow['3'].inputs.cfg).toBe(4.5);
    expect(workflow['3'].inputs.steps).toBe(24);
    expect(workflow['57'].inputs.fps).toBe(16);
    expect(workflow['58'].inputs.filename_prefix).toBe('test-video');
  });

  it('connects a reference image to the Wan start_image input', async () => {
    const service = createService();

    const workflow = await service.buildVideoWorkflow({
      positivePrompt: 'A realistic singer at a bar',
      negativePrompt: 'deformed anatomy',
      width: 1280,
      height: 704,
      length: 121,
      seed: 987654321,
      ...generationParameters,
      filenamePrefix: 'test-video',
      referenceImageFilename: 'scene-reference.png'
    });

    expect(workflow['56']).toEqual({
      class_type: 'LoadImage',
      inputs: {
        image: 'scene-reference.png'
      }
    });
    expect(workflow['55'].inputs.start_image).toEqual(['56', 0]);
  });
});
