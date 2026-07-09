<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Etapa 2 de 2 · Envio</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">Revise as opções, escolha a música e inicie a geração.</p>
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
          :submit-label="projectStatus === 'failed' ? 'Reenviar música' : 'Enviar música e começar'"
          :loading-label="projectStatus === 'failed' ? 'Reenviando música...' : 'Enviando música...'"
          @upload="uploadTrack"
        />
        <v-card
          v-if="projectStatus === 'draft' || projectStatus === 'failed'"
          class="surface-card mt-4"
          rounded="xl"
        >
          <v-card-text>
            <label class="auth-input-group">
              <span class="auth-input-label">Letra da música</span>
              <textarea
                v-model="manualLyricsText"
                class="auth-input auth-input--textarea"
                rows="12"
                placeholder="Cole a letra real aqui para o storyboard e as cenas seguirem esse texto, sem depender da transcricao automatica."
              />
            </label>
          </v-card-text>
        </v-card>
        <ProjectStatusTimeline
          v-else-if="statusPayload"
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
          <v-card-text>
            <h3 class="section-title">Projeto criado</h3>
            <p class="section-copy">O próximo passo é enviar o arquivo MP3 ou WAV original.</p>
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
              <h3 class="section-title">Configuração da geração</h3>
              <p class="section-copy">{{ nextStepDescription }}</p>
            </div>

            <div v-if="projectStatus === 'draft' || projectStatus === 'failed'" class="d-flex flex-column ga-3">
              <label class="auth-input-group">
                <span class="auth-input-label">Duração total do teste</span>
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
              <label class="auth-input-group">
                <span class="auth-input-label">Duração por cena</span>
                <input
                  v-model="sceneDurationSecondsInput"
                  class="auth-input"
                  type="number"
                  min="3"
                  max="30"
                  step="1"
                  placeholder="Opcional. Ex.: 5"
                />
              </label>
              <label class="auth-input-group">
                <span class="auth-input-label">Modelo visual</span>
                <select
                  v-model="visualCheckpointName"
                  class="auth-input"
                >
                  <option value="">Automático (recomendado)</option>
                  <option value="sd_xl_turbo_1.0.safetensors">SDXL Turbo</option>
                  <option
                    v-if="visualCheckpointName && visualCheckpointName !== 'sd_xl_turbo_1.0.safetensors'"
                    :value="visualCheckpointName"
                  >
                    Modelo atual: {{ visualCheckpointName }}
                  </option>
                </select>
              </label>

              <v-alert
                v-if="clipDurationSecondsRawValue && normalizedClipDurationSeconds === null"
                type="warning"
                variant="tonal"
              >
                Informe uma duração entre 1 e 600 segundos antes de tentar novamente.
              </v-alert>
              <v-alert
                v-if="sceneDurationSecondsRawValue && normalizedSceneDurationSeconds === null"
                type="warning"
                variant="tonal"
              >
                Informe uma duração por cena entre 3 e 30 segundos antes de tentar novamente.
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
              v-if="projectStatus === 'failed' || projectStatus === 'completed'"
              class="app-button"
              :disabled="loading"
              type="button"
              @click="retryProject"
            >
              {{ projectStatus === 'completed' ? 'Reprocessar com referências' : 'Tentar novamente' }}
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

    <section v-if="scenes.length" class="mt-6">
      <SceneList :scenes="scenes" @reference-upload="uploadSceneReferenceImage" />
    </section>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import FileUploadCard from '@/components/FileUploadCard.vue';
import ProjectStatusTimeline from '@/components/ProjectStatusTimeline.vue';
import SceneList from '@/components/SceneList.vue';
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
    ProjectStatusTimeline,
    SceneList
  }
})
export default class ProjectDetailPage extends Vue {
  loading = false;
  errorMessage: string | null = null;
  clipDurationSecondsInput: string | number = '';
  sceneDurationSecondsInput: string | number = '';
  visualCheckpointName = '';
  manualLyricsText = '';

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

  get scenes() {
    return this.projectsStore.currentScenes;
  }

  get isProcessing(): boolean {
    return !isTerminalProjectStatus(this.projectStatus) && this.projectStatus !== 'draft';
  }

  get clipDurationSecondsRawValue(): string {
    return String(this.clipDurationSecondsInput ?? '').trim();
  }

  get normalizedManualLyricsText(): string | null {
    const rawValue = this.manualLyricsText.trim();
    return rawValue ? rawValue : null;
  }

  get normalizedVisualCheckpointName(): string | null {
    const rawValue = this.visualCheckpointName.trim();
    return rawValue ? rawValue : null;
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

  get sceneDurationSecondsRawValue(): string {
    return String(this.sceneDurationSecondsInput ?? '').trim();
  }

  get normalizedSceneDurationSeconds(): number | null {
    const rawValue = this.sceneDurationSecondsRawValue;

    if (!rawValue) {
      return null;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue) || parsedValue < 3 || parsedValue > 30) {
      return null;
    }

    return Math.floor(parsedValue);
  }

  get nextStepDescription(): string {
    switch (this.projectStatus) {
      case 'draft':
        return 'Envie o áudio para iniciar a criação do videoclipe.';
      case 'uploaded':
      case 'queued':
      case 'processing':
      case 'analyzing':
      case 'storyboarding':
      case 'generating_scenes':
      case 'rendering':
        return 'A geração está em andamento. Você pode acompanhar o progresso em tempo real.';
      case 'failed':
        return 'A geração falhou. Revise as opções, reenvie o áudio ou tente novamente.';
      case 'completed':
        return 'O videoclipe foi concluído. Abra o resultado para assistir e baixar o MP4.';
      default:
        return 'Siga o próximo passo recomendado para este projeto.';
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
      this.sceneDurationSecondsInput =
        this.projectsStore.currentProject?.sceneDurationSeconds ?? '';
      this.visualCheckpointName =
        this.projectsStore.currentProject?.visualCheckpointName ?? '';
      this.manualLyricsText = this.projectsStore.currentProject?.lyrics?.rawText ?? '';

      if (this.projectsStore.currentProject?.status !== 'draft') {
        await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);
        await this.projectsStore.fetchScenes(this.projectId, this.authStore.token);
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

    if (this.clipDurationSecondsRawValue && this.normalizedClipDurationSeconds === null) {
      this.errorMessage = 'Informe uma duração entre 1 e 600 segundos antes de enviar o áudio';
      return;
    }

    if (this.sceneDurationSecondsRawValue && this.normalizedSceneDurationSeconds === null) {
      this.errorMessage =
        'Informe uma duração por cena entre 3 e 30 segundos antes de enviar o áudio';
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.uploadTrack(
        this.projectId,
        file,
        this.normalizedClipDurationSeconds,
        this.normalizedSceneDurationSeconds,
        this.normalizedVisualCheckpointName,
        this.normalizedManualLyricsText,
        this.authStore.token
      );
      await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);
      void this.$router.push({ name: 'processing', params: { id: this.projectId } });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao enviar a música';
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
      this.errorMessage = 'Informe uma duração entre 1 e 600 segundos antes de tentar novamente';
      return;
    }

    if (this.sceneDurationSecondsRawValue && this.normalizedSceneDurationSeconds === null) {
      this.errorMessage =
        'Informe uma duração por cena entre 3 e 30 segundos antes de tentar novamente';
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.retryProject(
        this.projectId,
        this.normalizedClipDurationSeconds,
        this.normalizedSceneDurationSeconds,
        this.normalizedVisualCheckpointName,
        this.normalizedManualLyricsText,
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
}
</script>
