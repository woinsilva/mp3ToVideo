<template>
  <AuthLayout title="Entre na sua conta" subtitle="Continue de onde parou e acompanhe seus videoclipes.">
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
          <span class="password-field">
            <input
              v-model="password"
              class="auth-input"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Sua senha"
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
          Preencha um email valido e uma senha com pelo menos 8 caracteres.
        </v-alert>
        <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

        <button class="auth-submit-button" type="submit" :disabled="loading">
          {{ loading ? 'Entrando...' : 'Entrar' }}
        </button>
      </form>

      <div class="demo-access">
        <div>
          <strong>Quer conhecer primeiro?</strong>
          <span>Use a conta de demonstração com um clique.</span>
        </div>
        <button class="app-button app-button--ghost" type="button" @click="fillDemoAccount">
          Usar conta demo
        </button>
      </div>

      <div class="auth-links">
        <span>Ainda não tem uma conta?</span>
        <button class="auth-link-button" type="button" @click="goToRegister">Criar conta grátis</button>
      </div>
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
  showPassword = false;

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

  fillDemoAccount() {
    this.email = 'demo@example.com';
    this.password = '12345678';
    this.submitted = false;
    this.errorMessage = null;
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

.demo-access {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  background: #f7f8fa;
}

.demo-access div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.demo-access strong {
  font-size: 0.86rem;
}

.demo-access span {
  color: #65676b;
  font-size: 0.76rem;
}

@media (max-width: 480px) {
  .demo-access {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
