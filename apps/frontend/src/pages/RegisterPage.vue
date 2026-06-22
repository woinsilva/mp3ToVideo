<template>
  <AuthLayout
    title="Criar conta"
    subtitle="O cadastro cria a sua workspace pessoal para iniciar projetos e acompanhar o pipeline completo."
  >
    <div class="auth-form-shell">
      <div class="auth-form-header">
        <h2 class="auth-form-title">Criar conta</h2>
        <p class="auth-form-copy">Preencha os dados basicos para entrar no dashboard e criar o primeiro projeto.</p>
      </div>

      <v-form class="d-flex flex-column ga-4" @submit.prevent="submit">
        <v-text-field
          v-model="name"
          label="Nome"
          variant="outlined"
          autocomplete="name"
          prepend-inner-icon="mdi-account-outline"
          :error-messages="nameErrors"
        />
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
          autocomplete="new-password"
          prepend-inner-icon="mdi-lock-outline"
          hint="Minimo de 8 caracteres."
          persistent-hint
          :error-messages="passwordErrors"
        />

        <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

        <v-btn color="primary" size="large" type="submit" :loading="loading" block>Criar conta</v-btn>
        <v-btn variant="text" block @click="goToLogin">Ja tenho conta</v-btn>
      </v-form>
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
