<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Etapa 2 de 2 · Envio</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">{{ isPromptProject ? 'Acompanhe a geração criada a partir da sua descrição.' : 'Revise as opções, escolha a música e inicie a geração.' }}</p>
      </div>
      <v-chip :color="statusTone" variant="tonal">{{ statusLabel }}</v-chip>
    </section>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <v-row>
      <v-col cols="12" lg="7">
        <FileUploadCard
          v-if="requiresTrackUpload"
          :loading="loading"
          :submit-label="projectStatus === 'failed' ? 'Reenviar música' : 'Enviar música e começar'"
          :loading-label="projectStatus === 'failed' ? 'Reenviando música...' : 'Enviando música...'"
          @upload="uploadTrack"
        />
        <section
          v-if="requiresTrackUpload"
          class="surface-card mt-4"
        >
          <div class="project-detail-card">
            <label class="auth-input-group">
              <span class="auth-input-label">Letra da música</span>
              <textarea
                v-model="manualLyricsText"
                class="auth-input auth-input--textarea"
                rows="12"
                placeholder="Cole a letra real aqui para o storyboard e as cenas seguirem esse texto, sem depender da transcricao automatica."
              />
            </label>
          </div>
        </section>
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
          :render-runtime="statusPayload.renderRuntime"
          :is-possibly-stalled="statusPayload.isPossiblyStalled"
        />
        <section v-else class="surface-card">
          <div class="project-detail-card">
            <h3 class="section-title">Projeto criado</h3>
            <p class="section-copy">O próximo passo é enviar o arquivo MP3 ou WAV original.</p>
            <p class="section-copy">
              Depois do upload, voce sera levado automaticamente para a tela de processamento.
            </p>
          </div>
        </section>
      </v-col>

      <v-col cols="12" lg="5">
        <section class="surface-card">
          <div class="project-detail-card d-flex flex-column ga-4">
            <div>
              <h3 class="section-title">Configuração da geração</h3>
              <p class="section-copy">{{ nextStepDescription }}</p>
            </div>

            <div v-if="requiresTrackUpload" class="d-flex flex-column ga-3">
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

              <div class="reference-info-card">
                <div class="reference-info-card__icon">
                  <v-icon icon="mdi-image-plus-outline" size="24" />
                </div>
                <div>
                  <h3>Imagens de referência por cena</h3>
                  <p>
                    As imagens são enviadas depois que o sistema criar a lista de cenas.
                    Este projeto deve gerar aproximadamente
                    <strong>{{ estimatedSceneCount }}</strong>
                    {{ estimatedSceneCount === 1 ? 'cena' : 'cenas' }} com os tempos atuais.
                  </p>
                  <p>
                    Fluxo: envie a música, aguarde as cenas aparecerem, adicione uma imagem em cada
                    cena desejada e clique em reprocessar com referências.
                  </p>
                </div>
              </div>

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
              v-if="canStartRender"
              class="app-button"
              :disabled="loading || !scenes.length"
              type="button"
              @click="startRender"
            >
              Iniciar renderizacao
            </button>

            <button
              v-if="canRetryProject"
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
          </div>
        </section>
      </v-col>
    </v-row>

    <section v-if="scenes.length" class="mt-6">
      <div class="visual-storyboard-card">
        <div class="visual-storyboard-card__header">
          <div>
            <h3>Storyboard visual</h3>
            <p>
              Use esta imagem como direcao criativa. Ela nao sera usada diretamente como primeiro frame do video.
            </p>
          </div>
          <button
            class="app-button"
            :disabled="loading"
            type="button"
            @click="regenerateVisualStoryboard"
          >
            Regerar storyboard visual
          </button>
        </div>

        <img
          v-if="visualStoryboardImageUrl"
          class="visual-storyboard-card__image"
          :src="visualStoryboardImageUrl"
          alt="Storyboard visual do videoclipe"
        />
        <div v-else class="visual-storyboard-card__placeholder">
          Nenhum storyboard visual gerado ainda.
        </div>

        <label class="auth-input-group mt-3">
          <span class="auth-input-label">O que mudar no storyboard?</span>
          <textarea
            v-model="visualStoryboardInstruction"
            class="auth-input auth-input--textarea"
            rows="3"
            placeholder="Ex.: mais sertanejo universitario, menos pessoas segurando garrafas, protagonista sempre de camisa jeans e chapeu branco."
          />
        </label>
      </div>

      <div class="reference-reprocess-banner">
        <div>
          <h3>Imagens de referencia prontas para uso</h3>
          <p>
        Adicione imagens de referência nas cenas abaixo e depois use
        <strong>Reprocessar com referências</strong> para gerar um novo vídeo baseado nelas.
          </p>
          <p v-if="canRetryProject" class="reference-reprocess-banner__hint">
            Esse botao fica disponivel quando o projeto estiver concluido ou falho.
          </p>
        </div>
        <button
          v-if="canStartRender"
          class="app-button"
          :disabled="loading"
          type="button"
          @click="startRender"
        >
          Iniciar renderizacao
        </button>
        <button
          v-if="canRetryProject"
          class="app-button"
          :disabled="loading"
          type="button"
          @click="retryProject"
        >
          Reprocessar com referencias
        </button>
      </div>
      <SceneList
        :scenes="scenes"
        @reference-upload="uploadSceneReferenceImage"
        @retry-render="retrySceneRender"
      />
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
  visualStoryboardInstruction = '';

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

  get isPromptProject(): boolean {
    return this.projectsStore.currentProject?.generationMode === 'prompt';
  }

  get requiresTrackUpload(): boolean {
    return !this.isPromptProject && (this.projectStatus === 'draft' || this.projectStatus === 'failed');
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

  get visualStoryboardImageUrl(): string | null {
    return this.projectsStore.currentVisualStoryboardImageUrl;
  }

  get isProcessing(): boolean {
    return (
      !isTerminalProjectStatus(this.projectStatus) &&
      this.projectStatus !== 'draft' &&
      this.projectStatus !== 'awaiting_references'
    );
  }

  get canRetryProject(): boolean {
    return this.projectStatus === 'failed' || this.projectStatus === 'completed';
  }

  get canStartRender(): boolean {
    return this.projectStatus === 'awaiting_references';
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

  get estimatedSceneCount(): number {
    const clipDuration =
      this.normalizedClipDurationSeconds ??
      this.projectsStore.currentProject?.clipDurationSeconds ??
      30;
    const sceneDuration =
      this.normalizedSceneDurationSeconds ??
      this.projectsStore.currentProject?.sceneDurationSeconds ??
      5;

    return Math.max(1, Math.ceil(clipDuration / sceneDuration));
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
        return 'Montando cenas e prompts visuais. Em seguida voce podera revisar as cenas antes do render.';
      case 'awaiting_references':
        return 'Cenas prontas. Adicione imagens de referencia opcionais e inicie a renderizacao quando estiver pronto.';
      case 'rendering':
        return 'A geração está em andamento. Você pode acompanhar o progresso em tempo real.';
      case 'failed':
        return this.isPromptProject
          ? 'A geração falhou. Tente novamente para gerar o vídeo a partir da mesma descrição.'
          : 'A geração falhou. Revise as opções, reenvie o áudio ou tente novamente.';
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
        await this.loadVisualStoryboard();
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

  async loadVisualStoryboard() {
    if (!this.authStore.token) {
      return;
    }

    try {
      await this.projectsStore.fetchVisualStoryboard(this.projectId, this.authStore.token);
      this.visualStoryboardInstruction =
        this.projectsStore.currentVisualStoryboard?.revisionInstruction ?? '';
    } catch {
      this.visualStoryboardInstruction = '';
    }
  }

  async regenerateVisualStoryboard() {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.regenerateVisualStoryboard(
        this.projectId,
        this.visualStoryboardInstruction,
        this.authStore.token
      );
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Falha ao regerar storyboard visual';
    } finally {
      this.loading = false;
    }
  }

  async startRender() {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.startRender(this.projectId, this.authStore.token);
      void this.$router.push({ name: 'processing', params: { id: this.projectId } });
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Falha ao iniciar renderizacao';
    } finally {
      this.loading = false;
    }
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
}
</script>

<style scoped>
.project-detail-card {
  overflow: hidden;
  padding: 24px;
}

.reference-info-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border: 1px solid #cfe1ff;
  border-radius: 14px;
  background: #f4f8ff;
}

.reference-info-card__icon {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: #0866ff;
  background: #e7f0ff;
}

.reference-info-card h3 {
  margin: 0 0 6px;
  color: #1c1e21;
  font-size: 0.9rem;
}

.reference-info-card p {
  margin: 0 0 6px;
  color: #65676b;
  font-size: 0.78rem;
  line-height: 1.45;
}

.reference-info-card p:last-child {
  margin-bottom: 0;
}

.reference-reprocess-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid #cfe1ff;
  border-radius: 16px;
  background: #f4f8ff;
}

.reference-reprocess-banner h3 {
  margin: 0 0 6px;
  color: #1c1e21;
  font-size: 0.95rem;
}

.reference-reprocess-banner p {
  margin: 0;
  color: #4b4f56;
  font-size: 0.84rem;
  line-height: 1.45;
}

.reference-reprocess-banner__hint {
  margin-top: 8px !important;
  color: #65676b !important;
}

.visual-storyboard-card {
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid #d8e2f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.06);
}

.visual-storyboard-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.visual-storyboard-card h3 {
  margin: 0 0 6px;
  color: #1c1e21;
  font-size: 1rem;
}

.visual-storyboard-card p {
  margin: 0;
  color: #65676b;
  font-size: 0.84rem;
  line-height: 1.45;
}

.visual-storyboard-card__image {
  display: block;
  width: 100%;
  max-height: 460px;
  object-fit: contain;
  border: 1px solid #edf0f5;
  border-radius: 14px;
  background: #0b1020;
}

.visual-storyboard-card__placeholder {
  display: grid;
  min-height: 180px;
  place-items: center;
  border: 1px dashed #c8d3e1;
  border-radius: 14px;
  background: #f8fafc;
  color: #65676b;
  font-size: 0.9rem;
}

@media (max-width: 600px) {
  .project-detail-card {
    padding: 18px;
  }

  .reference-reprocess-banner {
    flex-direction: column;
  }

  .visual-storyboard-card__header {
    flex-direction: column;
  }
}
</style>
