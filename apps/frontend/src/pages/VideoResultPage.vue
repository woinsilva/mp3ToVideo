<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Resultado</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">Player do MP4 final e lista das cenas geradas pelo pipeline.</p>
      </div>
      <div class="app-button-row">
        <button class="app-button app-button--ghost" type="button" @click="reloadPage">
          Atualizar
        </button>
        <button class="app-button app-button--outline" type="button" @click="goToProject">
          Voltar ao projeto
        </button>
      </div>
    </section>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <v-row>
      <v-col cols="12" lg="7">
        <VideoPreview :video-url="videoUrl" :loading="loading" @download="downloadVideo" />
      </v-col>
      <v-col cols="12" lg="5">
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
      </v-col>
    </v-row>

    <section class="mt-6">
      <SceneList :scenes="scenes" />
    </section>

    <v-card
      v-if="statusPayload && statusPayload.status !== 'completed'"
      class="surface-card mt-4"
      rounded="xl"
    >
      <v-card-text class="d-flex flex-column ga-3">
        <h3 class="section-title">Resultado ainda indisponivel</h3>
        <p class="section-copy">{{ resultBlockedMessage }}</p>
        <div class="app-button-row">
          <button
            v-if="statusPayload.status !== 'draft' && statusPayload.status !== 'failed'"
            class="app-button"
            type="button"
            @click="goToProcessing"
          >
            Ir para processamento
          </button>
          <button class="app-button app-button--outline" type="button" @click="goToProject">
            Abrir detalhes do projeto
          </button>
        </div>
      </v-card-text>
    </v-card>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import ProjectStatusTimeline from '@/components/ProjectStatusTimeline.vue';
import SceneList from '@/components/SceneList.vue';
import VideoPreview from '@/components/VideoPreview.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';

@Component({
  components: {
    AppLayout,
    ProjectStatusTimeline,
    SceneList,
    VideoPreview
  }
})
export default class VideoResultPage extends Vue {
  videoBlob: Blob | null = null;
  videoUrl: string | null = null;
  loading = false;
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

  get scenes() {
    return this.projectsStore.currentScenes;
  }

  get resultBlockedMessage(): string {
    if (!this.statusPayload) {
      return 'O status do projeto ainda esta sendo carregado.';
    }

    if (this.statusPayload.status === 'failed') {
      return 'A ultima tentativa falhou. Volte aos detalhes para reenviar o audio ou tentar novamente.';
    }

    if (this.statusPayload.status === 'draft') {
      return 'Envie o audio primeiro para iniciar a geracao do videoclipe.';
    }

    return 'O video final ainda nao terminou de processar. Acompanhe a renderizacao em tempo real.';
  }

  async mounted() {
    await this.loadPage();
  }

  beforeUnmount() {
    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
      this.videoUrl = null;
    }

    this.videoBlob = null;
  }

  async loadPage() {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      const status = await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);

      if (status.status === 'draft') {
        this.projectsStore.clearProjectArtifacts();
        void this.$router.push({ name: 'project-detail', params: { id: this.projectId } });
        return;
      }

      if (status.status !== 'completed') {
        this.projectsStore.clearProjectArtifacts();
        this.videoBlob = null;

        if (this.videoUrl) {
          URL.revokeObjectURL(this.videoUrl);
          this.videoUrl = null;
        }

        return;
      }

      await this.projectsStore.fetchRender(this.projectId, this.authStore.token);
      await this.projectsStore.fetchScenes(this.projectId, this.authStore.token);
      await this.loadVideoBlob();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao carregar resultado';
    } finally {
      this.loading = false;
    }
  }

  async loadVideoBlob() {
    if (!this.authStore.token) {
      return;
    }

    const blob = await this.projectsStore.downloadRender(this.projectId, this.authStore.token);
    this.videoBlob = blob;

    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
    }

    this.videoUrl = URL.createObjectURL(blob);
  }

  async downloadVideo() {
    if (!this.authStore.token) {
      return;
    }

    if (!this.videoBlob) {
      await this.loadVideoBlob();
    }

    if (!this.videoBlob) {
      return;
    }

    const url = URL.createObjectURL(this.videoBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.projectId}.mp4`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  reloadPage() {
    void this.loadPage();
  }

  goToProcessing() {
    void this.$router.push({ name: 'processing', params: { id: this.projectId } });
  }

  goToProject() {
    void this.$router.push({ name: 'project-detail', params: { id: this.projectId } });
  }
}
</script>
