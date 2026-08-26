import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantService } from '../../../apps/api/src/modules/assistant/assistant.service';

describe('AssistantService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the shared GPU lease and returns the local Qwen answer', async () => {
    const config = { get: vi.fn((key: string, fallback: unknown) => ({
      'ai.enableOllama': true,
      'ai.ollamaBaseUrl': 'http://ollama.local',
      'ai.ollamaModel': 'qwen3:8b',
      'ai.ollamaTimeoutMs': 10_000,
      'ai.ollamaKeepAlive': '0s',
      'ai.ollamaThink': false
    } as Record<string, unknown>)[key] ?? fallback) };
    const gpu = { withLease: vi.fn((_label: string, operation: () => Promise<unknown>) => operation()) };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'qwen3:8b', message: { content: 'Prompt melhorado.' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new AssistantService(config as never, gpu as never);

    const result = await service.chat({
      messages: [{ role: 'user', content: 'Melhore meu prompt' }],
      context: { routeName: 'children-clip', pageTitle: 'Estudio', projectId: 'project-1' }
    }, { userId: 'user-1', organizationId: 'org-1' });

    expect(gpu.withLease).toHaveBeenCalledWith('ollama-chat', expect.any(Function));
    expect(result).toEqual({ content: 'Prompt melhorado.', provider: 'ollama', model: 'qwen3:8b' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ model: 'qwen3:8b', stream: false, think: false, keep_alive: '0s' });
    expect(body.messages[0].content).toContain('Projeto em contexto: project-1');
  });

  it('rejects a history that does not end with a user message', async () => {
    const service = new AssistantService({ get: vi.fn() } as never, {} as never);
    await expect(service.chat({ messages: [{ role: 'assistant', content: 'Oi' }] }, {
      userId: 'user-1', organizationId: 'org-1'
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
