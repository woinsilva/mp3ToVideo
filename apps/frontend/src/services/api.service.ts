import type { ApiErrorPayload } from '@/types/api.types';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type UnauthorizedHandler = () => void;

export class ApiService {
  private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
  private unauthorizedHandler: UnauthorizedHandler | null = null;

  setUnauthorizedHandler(handler: UnauthorizedHandler): void {
    this.unauthorizedHandler = handler;
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
    token?: string
  ): Promise<T> {
    const headers = new Headers(options.headers ?? {});

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      this.handleUnauthorized(response.status, token);
      throw new ApiRequestError(await this.extractError(response), response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async download(path: string, token?: string): Promise<Blob> {
    const headers = new Headers();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      this.handleUnauthorized(response.status, token);
      throw new ApiRequestError(await this.extractError(response), response.status);
    }

    return response.blob();
  }

  private handleUnauthorized(status: number, token?: string): void {
    if (status === 401 && token) {
      this.unauthorizedHandler?.();
    }
  }

  private async extractError(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as ApiErrorPayload;

      if (Array.isArray(payload.message)) {
        return payload.message.join(', ');
      }

      return payload.message ?? payload.error ?? `Request failed with status ${response.status}`;
    }

    const text = await response.text();

    return text || `Request failed with status ${response.status}`;
  }
}

export const apiService = new ApiService();
