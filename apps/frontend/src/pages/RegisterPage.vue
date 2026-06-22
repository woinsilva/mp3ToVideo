<template>
  <AuthLayout title="Criar conta" subtitle="Crie sua conta para iniciar um projeto.">
    <div class="auth-form-shell">
      <form class="auth-native-form" @submit.prevent="submit">
        <label class="auth-input-group">
          <span class="auth-input-label">Nome</span>
          <input
            v-model="name"
            class="auth-input"
            type="text"
            autocomplete="name"
            placeholder="Seu nome"
          />
        </label>
        <p v-if="nameErrors.length" class="auth-input-error">{{ nameErrors[0] }}</p>

        <label class="auth-input-group">
          <span class="auth-input-label">Usuario ou email</span>
          <input
            v-model="email"
            class="auth-input"
            type="text"
            autocomplete="email"
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
            autocomplete="new-password"
            placeholder="Minimo de 8 caracteres"
          />
        </label>
        <p v-if="passwordErrors.length" class="auth-input-error">{{ passwordErrors[0] }}</p>

        <v-alert v-if="submitted && hasValidationErrors" type="warning" variant="tonal">
          Revise nome, email e senha antes de criar a conta.
        </v-alert>
        <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

        <button class="auth-submit-button" type="submit" :disabled="loading">
          {{ loading ? 'Criando conta...' : 'Criar conta' }}
        </button>
      </form>

      <div class="auth-links">
        <span>Ja tem uma conta?</span>
        <button class="auth-link-button" type="button" @click="goToLogin">Entrar</button>
      </div>
    </div>
  </AuthLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import {
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword
} from '@/utils/auth-form';

@Component({
  components: {
    AuthLayout
  }
})
export default class RegisterPage extends Vue {
  name = '';
  email = '';
  password = '';
  loading = false;
  errorMessage: string | null = null;
  submitted = false;

  get authStore(): any {
    return useAuthStore();
  }

  get nameErrors(): string[] {
    return this.submitted ? validateName(this.name) : [];
  }

  get emailErrors(): string[] {
    return this.submitted ? validateEmail(this.email) : [];
  }

  get passwordErrors(): string[] {
    return this.submitted ? validatePassword(this.password) : [];
  }

  get hasValidationErrors(): boolean {
    return (
      this.nameErrors.length > 0 || this.emailErrors.length > 0 || this.passwordErrors.length > 0
    );
  }

  async submit() {
    this.submitted = true;
    this.errorMessage = null;

    if (this.hasValidationErrors) {
      return;
    }

    this.loading = true;

    try {
      await this.authStore.register(
        this.name.trim(),
        normalizeEmail(this.email),
        this.password.trim()
      );
      void this.$router.push({ name: 'dashboard' });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao criar conta';
    } finally {
      this.loading = false;
    }
  }

  goToLogin() {
    void this.$router.push({ name: 'login' });
  }
}
</script>
