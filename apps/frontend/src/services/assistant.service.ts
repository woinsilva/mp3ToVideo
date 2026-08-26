import { apiService } from './api.service';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantContext {
  routeName?: string;
  pageTitle?: string;
  projectId?: string;
}

export const assistantService = {
  chat(messages: AssistantMessage[], context: AssistantContext, token: string) {
    return apiService.request<{ content: string; provider: 'ollama'; model: string }>(
      '/assistant/chat',
      { method: 'POST', body: JSON.stringify({ messages, context }) },
      token
    );
  }
};
