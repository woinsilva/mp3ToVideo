import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GpuLeaseService } from './gpu-lease.service';

interface OllamaGenerateResponse {
  response: string;
}

interface OllamaChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

interface OllamaStreamChunk extends OllamaChatResponse, OllamaGenerateResponse {
  done?: boolean;
  error?: string;
}

@Injectable()
export class OllamaClientService {
  private readonly logger = new Logger(OllamaClientService.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(GpuLeaseService)
    private readonly gpu: GpuLeaseService
  ) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('ai.enableOllama', false);
  }

  async generateJson<T>(messages: OllamaChatMessage[]): Promise<T | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return this.gpu.withLease('ollama', () => this.generateJsonWithGpu<T>(messages));
  }

  private async generateJsonWithGpu<T>(messages: OllamaChatMessage[]): Promise<T | null> {
    const baseUrl = this.configService.get<string>('ai.ollamaBaseUrl', 'http://localhost:11434');
    const model = this.configService.get<string>('ai.ollamaModel', 'qwen3:8b');
    const timeoutMs = this.configService.get<number>('ai.ollamaTimeoutMs', 180000);
    const keepAlive = this.configService.get<string>('ai.ollamaKeepAlive', '0s');
    const think = this.configService.get<boolean>('ai.ollamaThink', false);
    const allowFallbacks = this.configService.get<boolean>('ai.enableFallbacks', true);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: true,
          format: 'json',
          keep_alive: keepAlive,
          think,
          messages,
          options: {
            temperature: 0.2
          }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`);
      }

      const rawStream = await response.text();
      const content = rawStream
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as OllamaStreamChunk)
        .map((chunk) => {
          if (chunk.error) throw new Error(`Ollama stream failed: ${chunk.error}`);
          return chunk.message?.content ?? chunk.response ?? '';
        })
        .join('')
        .trim();

      if (!content) {
        throw new Error('Ollama returned an empty response');
      }

      return JSON.parse(content) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Ollama error';

      if (!allowFallbacks) {
        throw new Error(`Ollama generation failed: ${message}`);
      }

      this.logger.warn(`Falling back after Ollama failure: ${message}`);
      return null;
    }
  }
}
