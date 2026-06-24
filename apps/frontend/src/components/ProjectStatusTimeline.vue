<template>
  <v-card class="surface-card" rounded="xl">
    <v-card-text class="d-flex flex-column ga-4">
      <div class="d-flex justify-space-between align-center flex-wrap ga-3">
        <div>
          <h3 class="section-title">Processamento</h3>
          <p class="section-copy">{{ currentStep }}</p>
          <p v-if="detailMessage" class="section-copy detail-copy">{{ detailMessage }}</p>
          <p class="section-copy status-meta">{{ lastUpdateLabel }}</p>
        </div>
        <v-chip :color="tone" variant="tonal">{{ statusLabel }}</v-chip>
      </div>

      <v-progress-linear :model-value="progress" :color="tone" height="12" rounded />

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
        O processamento pode estar travado ou demorando mais do que o esperado. A geracao continua no backend.
      </v-alert>

      <v-alert v-if="errorMessage" type="error" variant="tonal">
        {{ errorMessage }}
      </v-alert>

      <div v-if="allActivity.length" class="d-flex flex-column ga-2">
        <div class="activity-header">
          <h4 class="section-title activity-title">Historico completo do pipeline</h4>
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
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

import {
  buildProjectStatusSteps,
  formatProjectStatusLabel,
  formatRelativeStatusUpdate,
  projectStatusTone
} from '@/utils/project-status';
import type { ProjectStatus, ProjectStatusActivityEntry } from '@/types/project.types';

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
  readonly errorMessage!: string | null;

  @Prop({ required: true })
  readonly lastUpdatedAt!: string;

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

  get lastUpdateLabel() {
    return formatRelativeStatusUpdate(this.lastUpdatedAt);
  }

  get allActivity(): ProjectStatusActivityEntry[] {
    return [...this.activityLog].reverse();
  }

  formatActivityTimestamp(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(value));
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
    if (stage === 'analyzing') return 'Analise';
    if (stage === 'storyboarding') return 'Storyboard';
    if (stage === 'generating_scenes') return 'Cenas';
    if (stage === 'rendering') return 'Render';
    if (stage === 'completed') return 'Concluido';
    if (stage === 'failed') return 'Falhou';
    return stage;
  }
}
</script>

<style scoped>
.detail-copy {
  color: rgba(var(--v-theme-on-surface), 0.82);
}

.activity-title {
  font-size: 0.95rem;
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
</style>
