import { describe, expect, it, vi } from 'vitest';

import { GpuLeaseService } from '../../../apps/worker/src/services/gpu-lease.service';

describe('GpuLeaseService', () => {
  it('reports contention, executes after acquiring the lease and releases it', async () => {
    const config = {
      get: vi.fn((key: string, fallback: number) => key === 'gpu.leasePollMs' ? 1 : fallback)
    };
    const redis = {
      set: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('OK'),
      get: vi.fn().mockResolvedValue('comfyui-wan:123:token'),
      eval: vi.fn().mockResolvedValue(1)
    };
    const service = new GpuLeaseService(config as never);
    (service as unknown as { redis: typeof redis }).redis = redis;
    const waiting = vi.fn().mockResolvedValue(undefined);
    const operation = vi.fn().mockResolvedValue('done');

    await expect(service.withLease('rife:test', operation, waiting)).resolves.toBe('done');

    expect(waiting).toHaveBeenCalledWith('comfyui-wan:123:token');
    expect(operation).toHaveBeenCalledOnce();
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('del'"), 1, expect.any(String), expect.stringContaining('rife:test'));
  });

  it('always releases the lease when the GPU operation fails', async () => {
    const config = { get: vi.fn((_key: string, fallback: number) => fallback) };
    const redis = { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn().mockResolvedValue(1) };
    const service = new GpuLeaseService(config as never);
    (service as unknown as { redis: typeof redis }).redis = redis;

    await expect(service.withLease('comfyui-still', async () => {
      throw new Error('generation failed');
    })).rejects.toThrow('generation failed');

    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('del'"), 1, expect.any(String), expect.stringContaining('comfyui-still'));
  });
});
