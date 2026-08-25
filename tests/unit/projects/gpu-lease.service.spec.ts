import { describe, expect, it, vi } from 'vitest';

import { GpuLeaseService } from '../../../apps/api/src/modules/projects/services/gpu-lease.service';

describe('API GpuLeaseService', () => {
  it('uses the global Redis lease and releases it after the operation', async () => {
    const config = { get: vi.fn((_key: string, fallback: number) => fallback) };
    const redis = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1)
    };
    const service = new GpuLeaseService(config as never);
    (service as unknown as { redis: typeof redis }).redis = redis;

    await expect(service.withLease('comfyui-storyboard', async () => 'done')).resolves.toBe('done');

    expect(redis.set).toHaveBeenCalledWith(
      'video-saas:gpu:lease',
      expect.stringContaining('comfyui-storyboard'),
      'PX',
      180_000,
      'NX'
    );
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('del'"),
      1,
      'video-saas:gpu:lease',
      expect.stringContaining('comfyui-storyboard')
    );
  });
});
