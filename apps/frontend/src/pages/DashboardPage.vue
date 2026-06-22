<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Dashboard</p>
        <h2 class="page-title">Projetos da workspace</h2>
        <p class="page-subtitle">
          Crie um projeto, envie o MP3 e acompanhe a geracao do videoclipe.
        </p>
      </div>
      <v-btn color="primary" size="large" prepend-icon="mdi-plus" @click="goToCreateProject">
        Novo videoclipe
      </v-btn>
    </section>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <v-row>
      <v-col v-for="project in projects" :key="project.id" cols="12" md="6" lg="4">
        <v-card class="surface-card project-card" rounded="xl">
          <v-card-text class="d-flex flex-column ga-3">
            <div class="d-flex justify-space-between align-start ga-3">
              <div>
                <h3 class="project-card-title">{{ project.title }}</h3>
                <p class="section-copy mb-0">
                  Atualizado em {{ formatDate(project.updatedAt) }}
                </p>
              </div>
              <v-chip color="primary" variant="tonal">{{ project.status }}</v-chip>
            </div>

            <v-btn variant="outlined" prepend-icon="mdi-arrow-right" @click="openProject(project.id)">
              Abrir projeto
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card v-if="!projects.length && !loading" class="surface-card empty-state" rounded="xl">
      <v-card-text>
        <h3 class="section-title">Nenhum projeto ainda</h3>
        <p class="section-copy">
          O fluxo do MVP comeca criando um projeto e enviando o MP3 original.
        </p>
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
export default class DashboardPage extends Vue {
  loading = false;

  get authStore(): any {
    return useAuthStore();
  }

  get projectsStore(): any {
    return useProjectsStore();
  }

  get projects() {
    return this.projectsStore.projects;
  }

  get errorMessage(): string | null {
    return this.projectsStore.errorMessage;
  }

  async mounted() {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;

    try {
      await this.projectsStore.fetchProjects(this.authStore.token);
    } finally {
      this.loading = false;
    }
  }

  goToCreateProject() {
    void this.$router.push({ name: 'create-project' });
  }

  openProject(projectId: string) {
    void this.$router.push({ name: 'project-detail', params: { id: projectId } });
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('pt-BR');
  }
}
</script>
