import { afterEach, describe, expect, it, vi } from 'vitest';

import { OllamaClientService } from '../../../apps/worker/src/services/ollama-client.service';

describe('OllamaClientService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('consumes streamed JSON chunks so long generations do not wait for response headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      JSON.stringify({ message: { content: '{"locations":' }, done: false }),
      JSON.stringify({ message: { content: '[]}' }, done: true })
    ].join('\n'), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const config = {
      get: vi.fn((key: string, fallback: unknown) => ({
        'ai.enableOllama': true,
        'ai.ollamaBaseUrl': 'http://127.0.0.1:11434',
        'ai.ollamaModel': 'qwen3:8b',
        'ai.ollamaTimeoutMs': 600_000,
        'ai.ollamaKeepAlive': '2m',
        'ai.ollamaThink': false,
        'ai.enableFallbacks': false
      }[key] ?? fallback))
    };

    const gpu = { withLease: vi.fn((_label: string, operation: () => Promise<unknown>) => operation()) };
    const service = new OllamaClientService(config as never, gpu as never);
    await expect(service.generateJson([{ role: 'user', content: 'plan' }])).resolves.toEqual({ locations: [] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ stream: true, format: 'json' });
    expect(gpu.withLease).toHaveBeenCalledWith('ollama', expect.any(Function));
  });

  it('surfaces an Ollama stream error when fallbacks are disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`${JSON.stringify({ error: 'model crashed' })}\n`, { status: 200 })));
    const config = { get: vi.fn((key: string, fallback: unknown) => key === 'ai.enableOllama' ? true : key === 'ai.enableFallbacks' ? false : fallback) };
    const gpu = { withLease: vi.fn((_label: string, operation: () => Promise<unknown>) => operation()) };
    const service = new OllamaClientService(config as never, gpu as never);
    await expect(service.generateJson([{ role: 'user', content: 'plan' }])).rejects.toThrow('Ollama stream failed: model crashed');
  });
});
