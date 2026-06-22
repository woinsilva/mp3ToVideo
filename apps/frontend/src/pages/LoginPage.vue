<template>
  <AuthLayout title="Entrar" subtitle="Acesse a sua conta para continuar projetos, acompanhar filas e baixar videos finalizados.">
    <div class="auth-form-shell">
      <div class="auth-form-header">
        <h2 class="auth-form-title">Login</h2>
        <p class="auth-form-copy">Use a conta criada por voce ou a conta demo do ambiente local.</p>
      </div>

      <v-form class="d-flex flex-column ga-4" @submit.prevent="submit">
        <v-text-field
          v-model="email"
          label="Email"
          type="email"
          variant="outlined"
          autocomplete="email"
          prepend-inner-icon="mdi-email-outline"
          :error-messages="emailErrors"
        />
        <v-text-field
          v-model="password"
          label="Senha"
          type="password"
          variant="outlined"
          autocomplete="current-password"
          prepend-inner-icon="mdi-lock-outline"
          :error-messages="passwordErrors"
        />

        <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

        <v-btn color="primary" size="large" type="submit" :loading="loading" block>Entrar</v-btn>
        <v-btn variant="text" block @click="goToRegister">Criar conta</v-btn>
      </v-form>
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
