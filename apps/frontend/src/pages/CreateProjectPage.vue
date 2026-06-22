<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Novo projeto</p>
        <h2 class="page-title">Criar videoclipe</h2>
        <p class="page-subtitle">Defina o titulo do projeto e siga para o upload do MP3.</p>
      </div>
    </section>

    <v-card class="surface-card form-card" rounded="xl">
      <v-card-text>
        <v-form class="d-flex flex-column ga-4" @submit.prevent="submit">
          <v-text-field v-model="title" label="Titulo do projeto" variant="outlined" />
          <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>
          <div class="d-flex ga-3">
            <v-btn color="primary" size="large" type="submit" :loading="loading">Criar projeto</v-btn>
            <v-btn variant="outlined" @click="cancel">Cancelar</v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';

@Component({
  components: {
    AppLayout
  }
})
export default class CreateProjectPage extends Vue {
  title = '';
  loading = false;
  errorMessage: string | null = null;

  get authStore(): any {
    return useAuthStore();
  }

  get projectsStore(): any {
    return useProjectsStore();
  }

  async submit() {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      const project = await this.projectsStore.createProject(this.title, this.authStore.token);
      void this.$router.push({ name: 'project-detail', params: { id: project.id } });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao criar projeto';
    } finally {
      this.loading = false;
    }
  }

  cancel() {
    void this.$router.push({ name: 'dashboard' });
  }
}
</script>
