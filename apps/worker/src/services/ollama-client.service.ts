import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

@Injectable()
export class OllamaClientService {
  private readonly logger = new Logger(OllamaClientService.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('ai.enableOllama', false);
  }

  async generateJson<T>(messages: OllamaChatMessage[]): Promise<T | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const baseUrl = this.configService.get<string>('ai.ollamaBaseUrl', 'http://localhost:11434');
    const model = this.configService.get<string>('ai.ollamaModel', 'qwen3:8b');
    const timeoutMs = this.configService.get<number>('ai.ollamaTimeoutMs', 180000);
    const keepAlive = this.configService.get<string>('ai.ollamaKeepAlive', '0s');
    const allowFallbacks = this.configService.get<boolean>('ai.enableFallbacks', true);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          keep_alive: keepAlive,
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

      const payload = (await response.json()) as OllamaChatResponse | OllamaGenerateResponse;
      const content =
        'message' in payload
          ? payload.message?.content?.trim()
          : (payload as OllamaGenerateResponse).response?.trim();

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
