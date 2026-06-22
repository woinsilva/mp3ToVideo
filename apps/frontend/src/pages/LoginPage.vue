<template>
  <AuthLayout title="Entrar" subtitle="Use a sua conta para continuar o fluxo do MP3 ate o MP4 final.">
    <v-form class="d-flex flex-column ga-4" @submit.prevent="submit">
      <v-text-field v-model="email" label="Email" type="email" variant="outlined" />
      <v-text-field v-model="password" label="Senha" type="password" variant="outlined" />

      <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

      <v-btn color="primary" size="large" type="submit" :loading="loading">Entrar</v-btn>
      <v-btn variant="text" @click="goToRegister">Criar conta</v-btn>
    </v-form>
  </AuthLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth.store';

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

  get authStore(): any {
    return useAuthStore();
  }

  async submit() {
    this.loading = true;
    this.errorMessage = null;

    try {
      await this.authStore.login(this.email, this.password);
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
