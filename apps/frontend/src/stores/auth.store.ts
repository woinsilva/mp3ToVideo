import { defineStore } from 'pinia';

import { ApiRequestError } from '@/services/api.service';
import { authService } from '@/services/auth.service';
import type { AuthOrganization, AuthUser } from '@/types/api.types';

const AUTH_STORAGE_KEY = 'video-saas-auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  organization: AuthOrganization | null;
  initialized: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: null,
    user: null,
    organization: null,
    initialized: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token)
  },
  actions: {
    hydrateFromStorage() {
      if (this.initialized || typeof window === 'undefined') {
        return;
      }

      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);

      if (!raw) {
        this.initialized = true;
        return;
      }

      try {
        const parsed = JSON.parse(raw) as Pick<AuthState, 'token' | 'user' | 'organization'>;
        this.token = parsed.token;
        this.user = parsed.user;
        this.organization = parsed.organization;
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      } finally {
        this.initialized = true;
      }
    },
    async bootstrapSession() {
      this.hydrateFromStorage();

      if (!this.token) {
        return;
      }

      try {
        const profile = await authService.me(this.token);
        this.user = profile.user;
        this.organization = profile.organization;
        this.persist();
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          this.logout();
        }
      }
    },
    async login(email: string, password: string) {
      const response = await authService.login({ email, password });
      this.consumeAuthResponse(response);
    },
    async register(name: string, email: string, password: string) {
      const response = await authService.register({ name, email, password });
      this.consumeAuthResponse(response);
    },
    logout() {
      this.token = null;
      this.user = null;
      this.organization = null;
      this.initialized = true;

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    },
    consumeAuthResponse(response: {
      accessToken: string;
      user: AuthUser;
      organization: AuthOrganization;
    }) {
      this.token = response.accessToken;
      this.user = response.user;
      this.organization = response.organization;
      this.initialized = true;
      this.persist();
    },
    persist() {
      if (typeof window === 'undefined') {
        return;
      }

      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          token: this.token,
          user: this.user,
          organization: this.organization
        })
      );
    }
  }
});
