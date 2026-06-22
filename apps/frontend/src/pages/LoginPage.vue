<template>
  <AuthLayout title="Entrar" subtitle="Acesse sua conta para continuar o projeto.">
    <div class="auth-form-shell">
      <v-form class="d-flex flex-column ga-3" @submit.prevent="submit">
        <v-text-field
          v-model="email"
          label="Usuario ou email"
          type="text"
          variant="outlined"
          autocomplete="username"
          :error-messages="emailErrors"
        />
        <v-text-field
          v-model="password"
          label="Senha"
          type="password"
          variant="outlined"
          autocomplete="current-password"
          :error-messages="passwordErrors"
        />

        <v-alert v-if="submitted && hasValidationErrors" type="warning" variant="tonal">
          Preencha um email valido e uma senha com pelo menos 8 caracteres.
        </v-alert>
        <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

        <v-btn color="primary" size="large" type="submit" :loading="loading" block @click="submit">
          Entrar
        </v-btn>
      </v-form>

      <div class="auth-links">
        <span>Nao tem uma conta?</span>
        <v-btn variant="text" type="button" @click="goToRegister">Criar conta</v-btn>
      </div>

      <v-alert type="info" variant="tonal">
        Conta demo: `demo@example.com` / `12345678`
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
