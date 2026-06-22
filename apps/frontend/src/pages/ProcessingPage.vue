<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Processamento</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">Polling automatico do status do projeto em tempo real.</p>
      </div>
      <button class="app-button app-button--outline" type="button" @click="goBackToProject">
        Voltar ao projeto
      </button>
    </section>

    <ProjectStatusTimeline
      v-if="statusPayload"
      :status="statusPayload.status"
      :progress="statusPayload.progress"
      :current-step="statusPayload.currentStep"
      :error-message="statusPayload.errorMessage"
    />

    <v-card v-else class="surface-card" rounded="xl">
      <v-card-text>Carregando status do projeto...</v-card-text>
    </v-card>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AppLayout from '@/layouts/AppLayout.vue';
import ProjectStatusTimeline from '@/components/ProjectStatusTimeline.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';
import { isTerminalProjectStatus } from '@/utils/project-status';

@Component({
  components: {
    AppLayout,
    ProjectStatusTimeline
  }
})
export default class ProcessingPage extends Vue {
  intervalId: ReturnType<typeof setInterval> | null = null;

  get authStore(): any {
    return useAuthStore();
  }

  get projectsStore(): any {
    return useProjectsStore();
  }

  get projectId(): string {
    return String(this.$route.params.id);
  }

  get projectTitle(): string {
    return this.projectsStore.currentProject?.title ?? 'Projeto';
  }

  get statusPayload() {
    return this.projectsStore.currentStatus;
  }

  async mounted() {
    if (!this.authStore.token) {
      return;
    }

    await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
    await this.refreshStatus();

    this.intervalId = setInterval(() => {
      void this.refreshStatus();
    }, 3000);
  }

  beforeUnmount() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async refreshStatus() {
    if (!this.authStore.token) {
      return;
    }

    const status = await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);

    if (isTerminalProjectStatus(status.status)) {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      if (status.status === 'completed') {
        void this.$router.push({ name: 'video-result', params: { id: this.projectId } });
      }
    }
  }

  goBackToProject() {
    void this.$router.push({ name: 'project-detail', params: { id: this.projectId } });
  }
}
</script>
