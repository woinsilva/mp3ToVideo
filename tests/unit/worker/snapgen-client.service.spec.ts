import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';

import { SnapGenClientService } from '../../../apps/worker/src/services/snapgen-client.service';

const config = (values: Record<string, unknown> = {}) => ({
  get: vi.fn((key: string, fallback: unknown) => values[key] ?? ({
    'snapgen.apiKey': 'secret', 'snapgen.baseUrl': 'https://api.snapgen.test/uapi/v1',
    'snapgen.requestTimeoutMs': 1000, 'snapgen.downloadTimeoutMs': 1000, 'snapgen.videoConcurrency': 1
  } as Record<string, unknown>)[key] ?? fallback)
});

describe('SnapGenClientService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('submits the validated Veo form without exposing the key in the URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ uuid: 'job-1', estimated_credit: 4 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const service = new SnapGenClientService(config() as never);
    const result = await service.submitVideoGeneration({ model: 'veo-3.1-fast', resolution: '720p', duration: 8, aspect_ratio: '16:9', mode_image: 'frame', prompt: 'subtle motion', ref_images: [fileURLToPath(import.meta.url)] });
    expect(result.uuid).toBe('job-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.snapgen.test/uapi/v1/video-gen/veo');
    expect(new Headers(init?.headers).get('x-api-key')).toBe('secret');
    expect((init?.body as FormData).get('model')).toBe('veo-3.1-fast');
    expect((init?.body as FormData).getAll('ref_images')).toHaveLength(1);
  });

  it('fails clearly when a successful response has no uuid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(new SnapGenClientService(config() as never).submitVideoGeneration({ model: 'veo-3.1-fast', resolution: '720p', duration: 8, aspect_ratio: '9:16', mode_image: 'ingredient', prompt: 'move', ref_images: [] })).rejects.toThrow('resposta de submissao invalida');
  });

  it('serializes external generations according to the configured concurrency', async () => {
    const service = new SnapGenClientService(config() as never);
    let active = 0;
    let maximum = 0;
    const operation = () => service.withGenerationSlot(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    });
    await Promise.all([operation(), operation(), operation()]);
    expect(maximum).toBe(1);
  });
});
