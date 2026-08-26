import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SnapGenVideoRequest {
  model: 'veo-3.1-fast';
  resolution: '720p' | '1080p';
  duration: 8;
  aspect_ratio: '16:9' | '9:16';
  mode_image: 'frame' | 'ingredient';
  prompt: string;
  ref_images: string[];
}

export interface SnapGenJobSubmission {
  uuid: string;
  model_name?: string;
  estimated_credit?: number;
  status?: number;
}

export interface SnapGenVideoResult {
  video_url: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  has_watermark?: number;
}

export interface SnapGenHistoryResponse {
  status: number;
  status_percentage?: number;
  used_credit?: number;
  last_frame_url?: string;
  generated_video?: SnapGenVideoResult[];
  status_desc?: string;
}

export interface SnapGenDownload { buffer: Buffer; mimeType: string; }

@Injectable()
export class SnapGenClientService {
  private readonly logger = new Logger(SnapGenClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly downloadTimeoutMs: number;
  private readonly concurrency: number;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('snapgen.baseUrl', 'https://api.snapgen.ai/uapi/v1').replace(/\/$/, '');
    this.apiKey = this.config.get<string>('snapgen.apiKey', '');
    this.requestTimeoutMs = this.config.get<number>('snapgen.requestTimeoutMs', 30_000);
    this.downloadTimeoutMs = this.config.get<number>('snapgen.downloadTimeoutMs', 120_000);
    this.concurrency = this.config.get<number>('snapgen.videoConcurrency', 1);
  }

  async withGenerationSlot<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try { return await operation(); }
    finally { this.active--; this.waiters.shift()?.(); }
  }

  async submitVideoGeneration(request: SnapGenVideoRequest): Promise<SnapGenJobSubmission> {
    this.assertConfigured();
    const formData = new FormData();
    formData.append('model', request.model);
    formData.append('resolution', request.resolution);
    formData.append('duration', String(request.duration));
    formData.append('aspect_ratio', request.aspect_ratio);
    formData.append('mode_image', request.mode_image);
    formData.append('prompt', request.prompt);
    for (const path of request.ref_images) {
      const buffer = await readFile(path);
      formData.append('ref_images', new Blob([buffer], { type: this.mimeType(path) }), basename(path));
    }
    const data = await this.requestJson(`${this.baseUrl}/video-gen/veo`, { method: 'POST', body: formData }, this.requestTimeoutMs, 1);
    if (!data || typeof data !== 'object' || typeof (data as { uuid?: unknown }).uuid !== 'string') throw new Error('SnapGen retornou uma resposta de submissao invalida');
    return data as SnapGenJobSubmission;
  }

  async getHistory(uuid: string): Promise<SnapGenHistoryResponse> {
    this.assertConfigured();
    const data = await this.requestJson(`${this.baseUrl}/history/${encodeURIComponent(uuid)}`, { method: 'GET' }, this.requestTimeoutMs, 3);
    if (!data || typeof data !== 'object' || typeof (data as { status?: unknown }).status !== 'number') throw new Error('SnapGen retornou um historico invalido');
    return data as SnapGenHistoryResponse;
  }

  async download(url: string): Promise<SnapGenDownload> {
    const response = await this.fetchWithRetry(url, { method: 'GET' }, this.downloadTimeoutMs, 3, false);
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' };
  }

  private async acquireSlot() {
    if (this.active >= this.concurrency) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  private assertConfigured() { if (!this.apiKey) throw new Error('SNAPGEN_API_KEY nao esta configurada no worker'); }

  private async requestJson(url: string, init: RequestInit, timeoutMs: number, attempts: number): Promise<unknown> {
    const response = await this.fetchWithRetry(url, init, timeoutMs, attempts);
    try { return await response.json(); }
    catch { throw new Error('SnapGen retornou JSON invalido'); }
  }

  private async fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, attempts: number, authenticate = true): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = new Headers(init.headers);
        if (authenticate) headers.set('x-api-key', this.apiKey);
        const response = await fetch(url, { ...init, headers, signal: controller.signal });
        if (response.ok) return response;
        const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
        const error = new Error(`SnapGen HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
        if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === attempts) throw error;
        lastError = error;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === attempts || (!this.isTransient(lastError) && !lastError.message.startsWith('SnapGen HTTP'))) throw lastError;
      } finally { clearTimeout(timeout); }
      this.logger.warn(`Falha transitoria SnapGen; nova tentativa ${attempt + 1}/${attempts}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
    throw lastError ?? new Error('Falha desconhecida ao consultar SnapGen');
  }

  private isTransient(error: Error) { return error.name === 'AbortError' || /fetch|network|socket|timeout/i.test(error.message); }
  private mimeType(path: string) {
    const extension = extname(path).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.webp') return 'image/webp';
    return 'image/png';
  }
}
