import { describe, expect, it, vi } from 'vitest';

import { ComfyUiWorkflowLoaderService } from '../../../apps/worker/src/services/comfyui-workflow-loader.service';

describe('ComfyUiWorkflowLoaderService', () => {
  it('loads and parameterizes the workflow JSON', async () => {
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

    const service = new ComfyUiWorkflowLoaderService(configService);

    const workflow = await service.buildVideoWorkflow({
      positivePrompt: 'A beautiful sunset',
      negativePrompt: 'blurry, dark',
      width: 1280,
      height: 704,
      length: 121,
      seed: 123456789,
      filenamePrefix: 'test-video'
    });

    expect(workflow['37'].inputs.unet_name).toBe('wan-unet.safetensors');
    expect(workflow['6'].inputs.text).toBe('A beautiful sunset');
    expect(workflow['7'].inputs.text).toBe('blurry, dark');
    expect(workflow['55'].inputs.width).toBe(1280);
    expect(workflow['55'].inputs.height).toBe(704);
    expect(workflow['55'].inputs.length).toBe(121);
    expect(workflow['3'].inputs.seed).toBe(123456789);
    expect(workflow['58'].inputs.filename_prefix).toBe('test-video');
  });
});
