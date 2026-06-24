<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Projeto</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">Envie o MP3 e siga para o acompanhamento do processamento.</p>
      </div>
      <v-chip :color="statusTone" variant="tonal">{{ statusLabel }}</v-chip>
    </section>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <v-row>
      <v-col cols="12" lg="7">
        <FileUploadCard
          v-if="projectStatus === 'draft' || projectStatus === 'failed'"
          :loading="loading"
          :submit-label="projectStatus === 'failed' ? 'Reenviar audio' : 'Enviar MP3'"
          :loading-label="projectStatus === 'failed' ? 'Reenviando audio...' : 'Enviando MP3...'"
          @upload="uploadTrack"
        />
        <ProjectStatusTimeline
          v-else-if="statusPayload"
          :status="statusPayload.status"
          :progress="statusPayload.progress"
          :current-step="statusPayload.currentStep"
          :detail-message="statusPayload.detailMessage"
          :activity-log="statusPayload.activityLog"
          :error-message="statusPayload.errorMessage"
          :last-updated-at="statusPayload.lastUpdatedAt"
          :is-possibly-stalled="statusPayload.isPossiblyStalled"
        />
        <v-card v-else class="surface-card" rounded="xl">
          <v-card-text>
            <h3 class="section-title">Projeto criado</h3>
            <p class="section-copy">O proximo passo e enviar o arquivo MP3 original.</p>
            <p class="section-copy">
              Depois do upload, voce sera levado automaticamente para a tela de processamento.
            </p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" lg="5">
        <v-card class="surface-card" rounded="xl">
          <v-card-text class="d-flex flex-column ga-4">
            <div>
              <h3 class="section-title">Proximos passos</h3>
              <p class="section-copy">{{ nextStepDescription }}</p>
            </div>

            <div v-if="projectStatus === 'failed'" class="d-flex flex-column ga-3">
              <label class="auth-input-group">
                <span class="auth-input-label">Gerar apenas os primeiros segundos</span>
                <input
                  v-model="clipDurationSecondsInput"
                  class="auth-input"
                  type="number"
                  min="1"
                  max="600"
                  step="1"
                  placeholder="Opcional. Ex.: 20"
                />
              </label>

              <v-alert
                v-if="clipDurationSecondsRawValue && normalizedClipDurationSeconds === null"
                type="warning"
                variant="tonal"
              >
                Informe uma duracao entre 1 e 600 segundos antes de reenfileirar.
              </v-alert>
            </div>

            <button
              v-if="isProcessing"
              class="app-button"
              :disabled="loading"
              type="button"
              @click="openProcessing"
            >
              Acompanhar processamento
            </button>

            <button
              v-if="projectStatus === 'failed'"
              class="app-button"
              :disabled="loading"
              type="button"
              @click="retryProject"
            >
              Tentar novamente
            </button>

            <button
              v-if="projectStatus === 'completed'"
              class="app-button app-button--success"
              :disabled="loading"
              type="button"
              @click="openResult"
            >
              Ver resultado
            </button>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import FileUploadCard from '@/components/FileUploadCard.vue';
import ProjectStatusTimeline from '@/components/ProjectStatusTimeline.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';
import {
  formatProjectStatusLabel,
  isTerminalProjectStatus,
  projectStatusTone
} from '@/utils/project-status';
import type { ProjectStatus } from '@/types/project.types';

@Component({
  components: {
    AppLayout,
    FileUploadCard,
    ProjectStatusTimeline
  }
})
export default class ProjectDetailPage extends Vue {
  loading = false;
  errorMessage: string | null = null;
  clipDurationSecondsInput: string | number = '';

  get projectId(): string {
    return String(this.$route.params.id);
  }

  get authStore(): any {
    return useAuthStore();
  }

  get projectsStore(): any {
    return useProjectsStore();
  }

  get projectTitle(): string {
    return this.projectsStore.currentProject?.title ?? 'Projeto';
  }

  get projectStatus(): ProjectStatus {
    return this.statusPayload?.status ?? this.projectsStore.currentProject?.status ?? 'draft';
  }

  get statusLabel(): string {
    return formatProjectStatusLabel(this.projectStatus);
  }

  get statusTone() {
    return projectStatusTone(this.projectStatus);
  }

  get statusPayload() {
    return this.projectsStore.currentStatus?.projectId === this.projectId
      ? this.projectsStore.currentStatus
      : null;
  }

  get isProcessing(): boolean {
    return !isTerminalProjectStatus(this.projectStatus) && this.projectStatus !== 'draft';
  }

  get clipDurationSecondsRawValue(): string {
    return String(this.clipDurationSecondsInput ?? '').trim();
  }

  get normalizedClipDurationSeconds(): number | null {
    const rawValue = this.clipDurationSecondsRawValue;

    if (!rawValue) {
      return null;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 600) {
      return null;
    }

    return Math.floor(parsedValue);
  }

  get nextStepDescription(): string {
    switch (this.projectStatus) {
      case 'draft':
        return 'Envie o audio para iniciar o pipeline de geracao do videoclipe.';
      case 'uploaded':
      case 'queued':
      case 'processing':
      case 'analyzing':
      case 'storyboarding':
      case 'generating_scenes':
      case 'rendering':
        return 'O processamento esta em andamento. Voce pode acompanhar o progresso em tempo real.';
      case 'failed':
        return 'A geracao falhou. Ajuste o recorte se necessario, reenvie o audio ou tente novamente.';
      case 'completed':
        return 'O videoclipe foi concluido. Abra o resultado para visualizar o MP4 e as cenas.';
      default:
        return 'Siga o proximo passo recomendado pelo status atual do projeto.';
    }
  }

  async mounted() {
    await this.loadProject();
  }

  async loadProject() {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      this.clipDurationSecondsInput =
        this.projectsStore.currentProject?.clipDurationSeconds ?? '';

      if (this.projectsStore.currentProject?.status !== 'draft') {
        await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao carregar projeto';
    } finally {
      this.loading = false;
    }
  }

  async uploadTrack(file: File) {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.uploadTrack(
        this.projectId,
        file,
        this.normalizedClipDurationSeconds,
        this.authStore.token
      );
      await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);
      void this.$router.push({ name: 'processing', params: { id: this.projectId } });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao enviar MP3';
    } finally {
      this.loading = false;
    }
  }

  openProcessing() {
    void this.$router.push({ name: 'processing', params: { id: this.projectId } });
  }

  openResult() {
    void this.$router.push({ name: 'video-result', params: { id: this.projectId } });
  }

  async retryProject() {
    if (!this.authStore.token) {
      return;
    }

    if (this.clipDurationSecondsRawValue && this.normalizedClipDurationSeconds === null) {
      this.errorMessage = 'Informe uma duracao entre 1 e 600 segundos antes de reenfileirar';
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.retryProject(
        this.projectId,
        this.normalizedClipDurationSeconds,
        this.authStore.token
      );
      void this.$router.push({ name: 'processing', params: { id: this.projectId } });
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Falha ao reenfileirar projeto';
    } finally {
      this.loading = false;
    }
  }
}
</script>
