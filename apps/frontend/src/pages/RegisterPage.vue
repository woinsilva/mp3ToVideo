<template>
  <AuthLayout title="Crie sua conta" subtitle="Comece seu primeiro videoclipe em poucos minutos.">
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
          <span class="password-field">
            <input
              v-model="password"
              class="auth-input"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="Mínimo de 8 caracteres"
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
              @click="showPassword = !showPassword"
            >
              <v-icon :icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" size="20" />
            </button>
          </span>
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
        <span>Já tem uma conta?</span>
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
  showPassword = false;

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

<style scoped>
.password-field {
  position: relative;
  display: block;
}

.password-field .auth-input {
  padding-right: 48px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: #65676b;
  background: transparent;
  cursor: pointer;
  transform: translateY(-50%);
}

.password-toggle:hover {
  background: #f0f2f5;
}
</style>
