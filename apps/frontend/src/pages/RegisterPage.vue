<template>
  <AuthLayout
    title="Criar conta"
    subtitle="O cadastro ja cria uma workspace pessoal para iniciar os projetos."
  >
    <v-form class="d-flex flex-column ga-4" @submit.prevent="submit">
      <v-text-field v-model="name" label="Nome" variant="outlined" />
      <v-text-field v-model="email" label="Email" type="email" variant="outlined" />
      <v-text-field v-model="password" label="Senha" type="password" variant="outlined" />

      <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

      <v-btn color="primary" size="large" type="submit" :loading="loading">Criar conta</v-btn>
      <v-btn variant="text" @click="goToLogin">Ja tenho conta</v-btn>
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
export default class RegisterPage extends Vue {
  name = '';
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
      await this.authStore.register(this.name, this.email, this.password);
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
