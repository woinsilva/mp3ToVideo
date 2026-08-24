<template>
  <section class="surface-card status-card">
    <div class="d-flex flex-column ga-4">
      <div class="status-heading">
        <div class="status-heading__main">
          <span class="status-symbol">
            <v-progress-circular v-if="isActive" indeterminate :color="tone" size="28" width="3" />
            <v-icon v-else :icon="statusIcon" size="25" />
          </span>
          <div>
          <h3 class="section-title">{{ friendlyHeading }}</h3>
          <p class="section-copy">{{ currentStep }}</p>
          <p v-if="detailMessage" class="section-copy detail-copy">{{ detailMessage }}</p>
          </div>
        </div>
        <div class="status-heading__meta">
          <strong>{{ progress }}%</strong>
          <span>{{ lastUpdateLabel }}</span>
        </div>
      </div>

      <v-progress-linear :model-value="progress" :color="tone" height="12" rounded />

      <div v-if="renderRuntime" class="runtime-panel" :class="`runtime-panel--${renderRuntime.health}`">
        <div class="runtime-panel__header">
          <div>
            <h4 class="runtime-panel__title">Acompanhamento do render</h4>
            <p class="runtime-panel__copy">{{ runtimeHealthLabel }}</p>
          </div>
          <v-chip :color="runtimeHealthColor" size="small" variant="tonal">
            {{ runtimeHealthChip }}
          </v-chip>
        </div>
        <div class="runtime-grid">
          <div class="runtime-metric">
            <span>Tempo total</span>
            <strong>{{ formatDuration(liveTotalElapsedSeconds) }}</strong>
          </div>
          <div class="runtime-metric">
            <span>Etapa atual</span>
            <strong>{{ formatDuration(liveStageElapsedSeconds) }}</strong>
          </div>
          <div class="runtime-metric">
            <span>Cena atual</span>
            <strong>{{ formatDuration(liveSceneElapsedSeconds) }}</strong>
          </div>
          <div class="runtime-metric">
            <span>Servidor</span>
            <strong>{{ formatHeartbeat(renderRuntime.lastServerHeartbeatAt) }}</strong>
          </div>
        </div>
        <p v-if="renderRuntime.activeScene" class="runtime-active-scene">
          Cena {{ renderRuntime.activeScene.index + 1 }}: {{ renderRuntime.activeScene.title }}
          · tentativa {{ renderRuntime.activeScene.attemptNumber }}
        </p>
      </div>

      <div class="timeline-grid">
        <div
          v-for="step in steps"
          :key="step.key"
          class="timeline-step"
          :class="{ reached: step.reached, active: step.active }"
        >
          <span>{{ step.label }}</span>
        </div>
      </div>

      <v-alert v-if="isPossiblyStalled" type="warning" variant="tonal">
        Esta etapa está demorando mais que o normal, mas a geração continua no servidor.
      </v-alert>

      <v-alert v-if="errorMessage" type="error" variant="tonal">
        {{ errorMessage }}
      </v-alert>

      <div v-if="lyrics || musicSections.length" class="d-flex flex-column ga-3">
        <div class="activity-header">
          <h4 class="section-title activity-title">Letra e estrutura da música</h4>
          <v-chip
            v-if="lyrics"
            :color="lyricsSourceColor"
            size="small"
            variant="tonal"
          >
            Letra: {{ lyricsSourceLabel }}
          </v-chip>
        </div>

        <div v-if="lyrics" class="lyrics-panel">
          <div class="lyrics-panel__block">
            <h5 class="lyrics-panel__title">Letra utilizada para criar as cenas</h5>
            <pre class="lyrics-panel__text">{{ lyrics.rawText }}</pre>
          </div>
          <details class="lyrics-normalized">
            <summary>Ver texto normalizado</summary>
            <div class="lyrics-panel__block">
            <h5 class="lyrics-panel__title">Letra normalizada</h5>
            <pre class="lyrics-panel__text">{{ lyrics.normalizedText }}</pre>
            </div>
          </details>
        </div>

        <div v-if="musicSections.length" class="sections-list">
          <div
            v-for="section in musicSections"
            :key="section.title + section.startSeconds"
            class="section-entry"
          >
            <div class="activity-entry__topline">
              <span>{{ section.title }} · {{ formatSeconds(section.startSeconds) }} – {{ formatSeconds(section.endSeconds) }}</span>
              <div class="activity-entry__chips">
                <v-chip size="x-small" variant="outlined">{{ section.type }}</v-chip>
              </div>
            </div>
            <p class="activity-entry__message">
              {{ section.lyricsExcerpt || 'Nenhum trecho de letra associado.' }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="allActivity.length" class="d-flex flex-column ga-2">
        <div class="activity-header">
          <h4 class="section-title activity-title">Histórico da geração</h4>
          <v-chip size="small" variant="tonal">{{ allActivity.length }} eventos</v-chip>
        </div>
        <div class="activity-list">
          <div
            v-for="entry in allActivity"
            :key="entry.timestamp + entry.message"
            class="activity-entry"
          >
            <div class="activity-entry__topline">
              <span>{{ formatActivityTimestamp(entry.timestamp) }}</span>
              <div class="activity-entry__chips">
                <v-chip
                  size="x-small"
                  class="text-uppercase font-weight-bold px-2"
                  variant="outlined"
                >
                  {{ formatStage(entry.stage) }}
                </v-chip>
                <v-chip
                  v-if="entry.progress !== null"
                  size="x-small"
                  class="text-uppercase font-weight-bold px-2"
                  variant="outlined"
                >
                  {{ entry.progress }}%
                </v-chip>
                <v-chip
                  v-if="entry.provider"
                  :color="getProviderColor(entry.provider)"
                  size="x-small"
                  class="text-uppercase font-weight-bold px-2"
                  variant="flat"
                >
                  {{ formatProvider(entry.provider) }}
                </v-chip>
              </div>
            </div>
            <p class="activity-entry__message">{{ entry.message }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

import {
  buildProjectStatusSteps,
  formatProjectStatusLabel,
  formatRelativeStatusUpdate,
  projectStatusTone
} from '@/utils/project-status';
import type {
  ProjectLyricsStatus,
  ProjectMusicSectionStatus,
  ProjectRenderRuntime,
  ProjectStatus,
  ProjectStatusActivityEntry
} from '@/types/project.types';

@Component
export default class ProjectStatusTimeline extends Vue {
  @Prop({ required: true })
  readonly status!: ProjectStatus;

  @Prop({ required: true })
  readonly progress!: number;

  @Prop({ required: true })
  readonly currentStep!: string;

  @Prop({ default: null })
  readonly detailMessage!: string | null;

  @Prop({ default: () => [] })
  readonly activityLog!: ProjectStatusActivityEntry[];

  @Prop({ default: null })
  readonly lyrics!: ProjectLyricsStatus | null;

  @Prop({ default: () => [] })
  readonly musicSections!: ProjectMusicSectionStatus[];

  @Prop({ default: null })
  readonly errorMessage!: string | null;

  @Prop({ required: true })
  readonly lastUpdatedAt!: string;

  @Prop({ default: null })
  readonly renderRuntime!: ProjectRenderRuntime | null;

  @Prop({ default: false })
  readonly isPossiblyStalled!: boolean;

  get steps() {
    return buildProjectStatusSteps(this.status, this.progress);
  }

  get tone() {
    return projectStatusTone(this.status);
  }

  get statusLabel() {
    return formatProjectStatusLabel(this.status);
  }

  get isActive(): boolean {
    return !['completed', 'failed', 'draft'].includes(this.status);
  }

  get friendlyHeading(): string {
    if (this.status === 'completed') return 'Videoclipe concluído';
    if (this.status === 'failed') return 'A geração encontrou um problema';
    if (this.status === 'draft') return 'Pronto para começar';
    if (this.status === 'awaiting_references') return 'Cenas prontas para revisao';
    return 'Criando seu videoclipe';
  }

  get statusIcon(): string {
    if (this.status === 'completed') return 'mdi-check';
    if (this.status === 'failed') return 'mdi-alert-outline';
    return 'mdi-music-note';
  }

  get lastUpdateLabel() {
    return formatRelativeStatusUpdate(this.lastUpdatedAt);
  }

  get liveTotalElapsedSeconds(): number | null {
    return this.liveElapsed(this.renderRuntime?.totalElapsedSeconds);
  }

  get liveStageElapsedSeconds(): number | null {
    return this.liveElapsed(this.renderRuntime?.currentStageElapsedSeconds);
  }

  get liveSceneElapsedSeconds(): number | null {
    return this.liveElapsed(this.renderRuntime?.currentSceneElapsedSeconds);
  }

  get runtimeHealthLabel(): string {
    if (!this.renderRuntime) return '';
    if (this.renderRuntime.health === 'suspected_stuck') {
      return 'Sem confirmacao recente do servidor. Voce pode aguardar ou reiniciar a cena atual.';
    }
    if (this.renderRuntime.health === 'long_running') {
      return 'Esta etapa esta demorando, mas o servidor segue confirmando atividade.';
    }
    return 'Render em andamento com confirmacoes recentes do servidor.';
  }

  get runtimeHealthChip(): string {
    if (!this.renderRuntime) return '';
    if (this.renderRuntime.health === 'suspected_stuck') return 'Verificar';
    if (this.renderRuntime.health === 'long_running') return 'Demorado';
    return 'Ativo';
  }

  get runtimeHealthColor(): string {
    if (!this.renderRuntime) return 'primary';
    if (this.renderRuntime.health === 'suspected_stuck') return 'warning';
    if (this.renderRuntime.health === 'long_running') return 'info';
    return 'success';
  }

  get allActivity(): ProjectStatusActivityEntry[] {
    return [...this.activityLog].reverse();
  }

  get lyricsSourceLabel(): string {
    if (!this.lyrics) return '';
    if (this.lyrics.source === 'whisper') return 'Whisper';
    if (this.lyrics.source === 'manual') return 'Manual';
    if (this.lyrics.source === 'mock') return 'Mock';
    return this.lyrics.source;
  }

  get lyricsSourceColor(): string {
    if (!this.lyrics) return 'grey';
    if (this.lyrics.source === 'whisper') return 'green';
    if (this.lyrics.source === 'manual') return 'blue';
    if (this.lyrics.source === 'mock') return 'deep-orange';
    return 'grey';
  }

  formatActivityTimestamp(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(value));
  }

  formatDuration(value: number | null): string {
    if (value === null) return '--';
    const safeValue = Math.max(0, Math.floor(value));
    const hours = Math.floor(safeValue / 3600);
    const minutes = Math.floor((safeValue % 3600) / 60);
    const seconds = safeValue % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  formatHeartbeat(value: string | null): string {
    return value ? formatRelativeStatusUpdate(value) : 'Sem sinal';
  }

  liveElapsed(value: number | null | undefined): number | null {
    if (typeof value !== 'number') {
      return null;
    }

    return value;
  }

  getProviderColor(provider: string): string {
    if (provider === 'comfyui-video') return 'green';
    if (provider === 'comfyui-image') return 'blue';
    if (provider === 'procedural') return 'deep-orange';
    return 'grey';
  }

  formatProvider(provider: string): string {
    if (provider === 'comfyui-video') return 'IA Video';
    if (provider === 'comfyui-image') return 'IA Image';
    if (provider === 'procedural') return 'Fallback';
    return provider;
  }

  formatStage(stage: string): string {
    if (stage === 'processing') return 'Preparacao';
    if (stage === 'analyzing') return 'Análise';
    if (stage === 'storyboarding') return 'Storyboard';
    if (stage === 'generating_scenes') return 'Cenas';
    if (stage === 'awaiting_references') return 'Revisao';
    if (stage === 'rendering') return 'Render';
    if (stage === 'completed') return 'Concluído';
    if (stage === 'failed') return 'Falhou';
    return stage;
  }

  formatSeconds(value: number): string {
    return `${value.toFixed(1)}s`;
  }
}
</script>

<style scoped>
.status-card {
  overflow: hidden;
  padding: 24px;
}

.detail-copy {
  color: #4b4f56;
}

.status-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.status-heading__main {
  display: flex;
  align-items: flex-start;
  gap: 13px;
}

.status-symbol {
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 50%;
  color: #0866ff;
  background: #e7f3ff;
}

.status-heading__meta {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
}

.status-heading__meta strong {
  color: #0866ff;
  font-size: 1.25rem;
}

.status-heading__meta span {
  color: #65676b;
  font-size: 0.74rem;
}

.runtime-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  background: #f7f8fa;
}

.runtime-panel--long_running {
  border-color: #b6dcff;
  background: #f1f8ff;
}

.runtime-panel--suspected_stuck {
  border-color: #ffd18a;
  background: #fff8e8;
}

.runtime-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.runtime-panel__title {
  margin: 0;
  color: #1c1e21;
  font-size: 0.9rem;
}

.runtime-panel__copy,
.runtime-active-scene {
  margin: 4px 0 0;
  color: #65676b;
  font-size: 0.78rem;
  line-height: 1.45;
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.runtime-metric {
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  background: #fff;
}

.runtime-metric span,
.runtime-metric strong {
  display: block;
}

.runtime-metric span {
  color: #65676b;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
}

.runtime-metric strong {
  margin-top: 4px;
  color: #1c1e21;
  font-size: 0.95rem;
}

.activity-title {
  font-size: 0.95rem;
}

.lyrics-panel,
.sections-list {
  max-height: 20rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 0.35rem;
}

.lyrics-panel__block,
.section-entry {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.lyrics-normalized summary {
  margin: 0 0 8px;
  color: #0866ff;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 700;
}

.lyrics-panel__title {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.lyrics-panel__text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  color: rgba(var(--v-theme-on-surface), 0.9);
  line-height: 1.5;
}

.activity-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.activity-list {
  max-height: 32rem;
  overflow-y: auto;
  padding-right: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.activity-entry {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.activity-entry__topline {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.activity-entry__chips {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.activity-entry__message {
  margin: 0.35rem 0 0;
  color: rgba(var(--v-theme-on-surface), 0.88);
  white-space: pre-line;
  line-height: 1.5;
  word-break: break-word;
}

.activity-list::-webkit-scrollbar {
  width: 10px;
}

.activity-list::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 999px;
}

.activity-list::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 999px;
}

@media (max-width: 600px) {
  .status-card {
    padding: 18px;
  }

  .status-heading {
    flex-direction: column;
  }

  .status-heading__meta {
    align-items: center;
    flex-direction: row;
    gap: 8px;
  }

  .activity-entry__topline {
    flex-direction: column;
  }

  .activity-entry__chips {
    justify-content: flex-start;
  }

  .runtime-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
