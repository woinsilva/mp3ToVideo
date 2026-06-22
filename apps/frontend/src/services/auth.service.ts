import { apiService } from '@/services/api.service';
import type { AuthResponse, AuthUser, AuthOrganization } from '@/types/api.types';

class AuthService {
  register(input: { name: string; email: string; password: string }) {
    return apiService.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  login(input: { email: string; password: string }) {
    return apiService.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  me(token: string) {
    return apiService.request<{ user: AuthUser; organization: AuthOrganization }>('/auth/me', {}, token);
  }
}

export const authService = new AuthService();
