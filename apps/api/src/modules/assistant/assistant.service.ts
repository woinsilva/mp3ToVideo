import { BadGatewayException, BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GpuLeaseService } from '../projects/services/gpu-lease.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { AssistantChatDto } from './dtos/assistant-chat.dto';

interface OllamaChatResponse {
  model?: string;
  message?: { content?: string };
  error?: string;
}

@Injectable()
export class AssistantService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(GpuLeaseService) private readonly gpu: GpuLeaseService
  ) {}

  async chat(input: AssistantChatDto, user: AuthenticatedUser) {
    const messages = input.messages
      .map((message) => ({ role: message.role, content: message.content.trim() }))
      .filter((message) => message.content);
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      throw new BadRequestException('Envie uma mensagem para o assistente');
    }
    if (!this.config.get<boolean>('ai.enableOllama', false)) {
      throw new ServiceUnavailableException('O assistente local Qwen esta desativado');
    }

    const baseUrl = this.config.get<string>('ai.ollamaBaseUrl', 'http://localhost:11434');
    const model = this.config.get<string>('ai.ollamaModel', 'qwen3:14b');
    const timeoutMs = this.config.get<number>('ai.ollamaTimeoutMs', 600_000);
    const context = input.context;
    const system = [
      'Voce e o assistente criativo integrado ao ClipForge.',
      'Responda em portugues do Brasil, salvo se o usuario pedir outro idioma.',
      'Ajude com prompts, roteiro, cenas, personagens, letras, continuidade visual e duvidas gerais.',
      'Quando melhorar um prompt, entregue uma versao pronta para copiar e explique brevemente as mudancas.',
      'Nao afirme que executou, salvou ou alterou algo no projeto; este chat apenas orienta.',
      `Identificador interno do usuario: ${user.userId}.`,
      context?.pageTitle ? `Tela atual: ${context.pageTitle}.` : null,
      context?.routeName ? `Rota atual: ${context.routeName}.` : null,
      context?.projectId ? `Projeto em contexto: ${context.projectId}.` : null
    ].filter(Boolean).join(' ');

    return this.gpu.withLease('ollama-chat', async () => {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            think: this.config.get<boolean>('ai.ollamaThink', false),
            keep_alive: this.config.get<string>('ai.ollamaKeepAlive', '0s'),
            messages: [{ role: 'system', content: system }, ...messages],
            options: { temperature: 0.45, top_p: 0.9 }
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new BadGatewayException(`Nao foi possivel consultar o Qwen: ${detail}`);
      }
      const payload = await response.json() as OllamaChatResponse;
      if (!response.ok || payload.error) {
        throw new BadGatewayException(payload.error || `Ollama respondeu com status ${response.status}`);
      }
      const content = payload.message?.content?.trim();
      if (!content) throw new BadGatewayException('O Qwen retornou uma resposta vazia');
      return { content, provider: 'ollama', model: payload.model || model };
    });
  }
}
