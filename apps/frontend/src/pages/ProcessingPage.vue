<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Processamento</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">Polling automatico do status do projeto em tempo real.</p>
      </div>
      <div class="app-button-row">
        <button class="app-button app-button--ghost" type="button" @click="refreshManually">
          Atualizar agora
        </button>
        <button class="app-button app-button--outline" type="button" @click="goBackToProject">
          Voltar ao projeto
        </button>
      </div>
    </section>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <ProjectStatusTimeline
      v-if="statusPayload"
      :status="statusPayload.status"
      :progress="statusPayload.progress"
      :current-step="statusPayload.currentStep"
      :detail-message="statusPayload.detailMessage"
      :activity-log="statusPayload.activityLog"
      :lyrics="statusPayload.lyrics"
      :music-sections="statusPayload.musicSections"
      :error-message="statusPayload.errorMessage"
      :last-updated-at="statusPayload.lastUpdatedAt"
      :is-possibly-stalled="statusPayload.isPossiblyStalled"
    />

    <v-card v-else class="surface-card" rounded="xl">
      <v-card-text>Carregando status do projeto...</v-card-text>
    </v-card>

    <v-card v-if="statusPayload?.status === 'failed'" class="surface-card mt-4" rounded="xl">
      <v-card-text class="d-flex flex-column ga-3">
        <h3 class="section-title">Processamento interrompido</h3>
        <p class="section-copy">
          O projeto voltou para a tela de detalhes para permitir retry ou reenvio do audio.
        </p>
        <div class="app-button-row">
          <button class="app-button" type="button" @click="goBackToProject">Abrir detalhes</button>
        </div>
      </v-card-text>
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
  errorMessage: string | null = null;

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
    return this.projectsStore.currentStatus?.projectId === this.projectId
      ? this.projectsStore.currentStatus
      : null;
  }

  async mounted() {
    if (!this.authStore.token) {
      return;
    }

    try {
      await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      await this.refreshStatus();
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Falha ao carregar processamento';
      return;
    }

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

    let status;

    try {
      status = await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);
      this.errorMessage = null;
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Falha ao consultar status do projeto';
      return;
    }

    if (isTerminalProjectStatus(status.status)) {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      if (status.status === 'completed') {
        void this.$router.push({ name: 'video-result', params: { id: this.projectId } });
      } else if (status.status === 'failed') {
        await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      }

      return;
    }

    if (status.status === 'draft') {
      void this.$router.push({ name: 'project-detail', params: { id: this.projectId } });
    }
  }

  refreshManually() {
    void this.refreshStatus();
  }

  goBackToProject() {
    void this.$router.push({ name: 'project-detail', params: { id: this.projectId } });
  }
}
</script>
