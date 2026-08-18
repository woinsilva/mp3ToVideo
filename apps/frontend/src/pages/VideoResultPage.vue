<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Videoclipe concluído</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">Seu vídeo está pronto para assistir, baixar e compartilhar.</p>
      </div>
      <div class="app-button-row">
        <button class="app-button app-button--ghost" type="button" @click="reloadPage">
          <v-icon icon="mdi-refresh" size="18" /> Atualizar
        </button>
        <button class="app-button app-button--outline" type="button" @click="goToProject">
          <v-icon icon="mdi-arrow-left" size="18" /> Detalhes
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
          :render-runtime="statusPayload.renderRuntime"
          :is-possibly-stalled="statusPayload.isPossiblyStalled"
        />
      </v-col>
    </v-row>

    <section class="mt-6">
      <SceneList
        :scenes="scenes"
        @reference-upload="uploadSceneReferenceImage"
        @retry-render="retrySceneRender"
      />
    </section>

    <v-card v-if="statusPayload?.status === 'completed'" class="surface-card mt-4" rounded="xl">
      <v-card-text class="d-flex flex-column ga-3">
        <h3 class="section-title">Interpolação de frames RIFE 2x</h3>
        <p class="section-copy">Gera uma versão separada com aproximadamente o dobro do FPS, sem executar o Wan novamente.</p>
        <p v-if="interpolationStatus?.job">{{ interpolationStatus.job.detailMessage }} ({{ interpolationStatus.job.progress }}%)</p>
        <v-alert v-if="interpolationStatus?.job?.status === 'failed'" type="error" variant="tonal">
          {{ interpolationStatus.job.errorMessage }} O vídeo original continua disponível.
        </v-alert>
        <video v-if="interpolatedVideoUrl" class="interpolated-video" :src="interpolatedVideoUrl" controls playsinline />
        <div class="app-button-row">
          <button
            v-if="!interpolationStatus?.asset && !interpolationRunning"
            class="app-button"
            type="button"
            :disabled="interpolationLoading"
            @click="requestInterpolation"
          >
            {{ interpolationStatus?.job?.status === 'failed' ? 'Tentar interpolar novamente' : 'Interpolar com RIFE 2x' }}
          </button>
          <button v-if="interpolationStatus?.asset" class="app-button" type="button" @click="downloadInterpolatedVideo">
            Baixar versão RIFE 2x
          </button>
        </div>
      </v-card-text>
    </v-card>

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
import { projectsService } from '@/services/projects.service';
import type { FrameInterpolationStatus } from '@/types/project.types';

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
  interpolationStatus: FrameInterpolationStatus | null = null;
  interpolationLoading = false;
  interpolatedBlob: Blob | null = null;
  interpolatedVideoUrl: string | null = null;
  interpolationPollTimer: ReturnType<typeof setTimeout> | null = null;

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

  get interpolationRunning(): boolean {
    return ['queued', 'active', 'retrying'].includes(this.interpolationStatus?.job?.status ?? '');
  }

  get resultBlockedMessage(): string {
    if (!this.statusPayload) {
      return 'O status do projeto ainda esta sendo carregado.';
    }

    if (this.statusPayload.status === 'failed') {
      return 'A última tentativa falhou. Volte aos detalhes para revisar as opções ou tentar novamente.';
    }

    if (this.statusPayload.status === 'draft') {
      return 'Envie o áudio primeiro para iniciar a criação do videoclipe.';
    }

    return 'O vídeo final ainda está sendo processado. Acompanhe a renderização em tempo real.';
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
    if (this.interpolationPollTimer) clearTimeout(this.interpolationPollTimer);
    if (this.interpolatedVideoUrl) URL.revokeObjectURL(this.interpolatedVideoUrl);
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
      await this.loadInterpolationStatus();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao carregar resultado';
    } finally {
      this.loading = false;
    }
  }

  async loadInterpolationStatus() {
    if (!this.authStore.token) return;
    this.interpolationStatus = await projectsService.interpolation(this.projectId, this.authStore.token);
    if (this.interpolationStatus.asset && !this.interpolatedVideoUrl) {
      this.interpolatedBlob = await projectsService.downloadInterpolation(this.projectId, this.authStore.token);
      this.interpolatedVideoUrl = URL.createObjectURL(this.interpolatedBlob);
    }
    if (this.interpolationRunning) {
      if (this.interpolationPollTimer) clearTimeout(this.interpolationPollTimer);
      this.interpolationPollTimer = setTimeout(() => void this.loadInterpolationStatus(), 3000);
    }
  }

  async requestInterpolation() {
    if (!this.authStore.token) return;
    this.interpolationLoading = true;
    this.errorMessage = null;
    try {
      await projectsService.requestInterpolation(this.projectId, this.authStore.token);
      await this.loadInterpolationStatus();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao enfileirar interpolação';
    } finally {
      this.interpolationLoading = false;
    }
  }

  async downloadInterpolatedVideo() {
    if (!this.authStore.token) return;
    const blob = this.interpolatedBlob ?? await projectsService.downloadInterpolation(this.projectId, this.authStore.token);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.projectId}-rife-2x.mp4`;
    anchor.click();
    URL.revokeObjectURL(url);
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

  async uploadSceneReferenceImage(payload: { sceneId: string; file: File }) {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.uploadSceneReferenceImage(
        this.projectId,
        payload.sceneId,
        payload.file,
        this.authStore.token
      );
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Falha ao enviar imagem de referencia';
    } finally {
      this.loading = false;
    }
  }

  async retrySceneRender(payload: { sceneId: string }) {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.retrySceneRender(
        this.projectId,
        payload.sceneId,
        this.authStore.token
      );
      await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Falha ao reiniciar render da cena';
    } finally {
      this.loading = false;
    }
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

<style scoped>
.interpolated-video { width: 100%; max-height: 520px; border-radius: 12px; background: #000; }
</style>
