<template>
  <AuthLayout title="Entrar" subtitle="Acesse sua conta para continuar o projeto.">
    <div class="auth-form-shell">
      <form class="auth-native-form" @submit.prevent="submit">
        <label class="auth-input-group">
          <span class="auth-input-label">Usuario ou email</span>
          <input
            v-model="email"
            class="auth-input"
            type="text"
            autocomplete="username"
            placeholder="voce@exemplo.com"
          />
        </label>
        <p v-if="emailErrors.length" class="auth-input-error">{{ emailErrors[0] }}</p>

        <label class="auth-input-group">
          <span class="auth-input-label">Senha</span>
          <input
            v-model="password"
            class="auth-input"
            type="password"
            autocomplete="current-password"
            placeholder="Sua senha"
          />
        </label>
        <p v-if="passwordErrors.length" class="auth-input-error">{{ passwordErrors[0] }}</p>

        <v-alert v-if="submitted && hasValidationErrors" type="warning" variant="tonal">
          Preencha um email valido e uma senha com pelo menos 8 caracteres.
        </v-alert>
        <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

        <button class="auth-submit-button" type="submit" :disabled="loading">
          {{ loading ? 'Entrando...' : 'Entrar' }}
        </button>
      </form>

      <div class="auth-links">
        <span>Nao tem uma conta?</span>
        <button class="auth-link-button" type="button" @click="goToRegister">Criar conta</button>
      </div>

      <v-alert type="info" variant="tonal">
        Conta demo: demo@example.com / 12345678
      </v-alert>
    </div>
  </AuthLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { normalizeEmail, validateEmail, validatePassword } from '@/utils/auth-form';

@Component({
  components: {
    AuthLayout
  }
})
export default class LoginPage extends Vue {
  email = '';
  password = '';
  loading = false;
  errorMessage: string | null = null;
  submitted = false;

  get authStore(): any {
    return useAuthStore();
  }

  get emailErrors(): string[] {
    return this.submitted ? validateEmail(this.email) : [];
  }

  get passwordErrors(): string[] {
    return this.submitted ? validatePassword(this.password) : [];
  }

  get hasValidationErrors(): boolean {
    return this.emailErrors.length > 0 || this.passwordErrors.length > 0;
  }

  async submit() {
    this.submitted = true;
    this.errorMessage = null;

    if (this.hasValidationErrors) {
      return;
    }

    this.loading = true;

    try {
      await this.authStore.login(normalizeEmail(this.email), this.password.trim());
      void this.$router.push({ name: 'dashboard' });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao autenticar';
    } finally {
      this.loading = false;
    }
  }

  goToRegister() {
    void this.$router.push({ name: 'register' });
  }
}
</script>
