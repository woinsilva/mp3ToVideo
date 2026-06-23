<template>
  <v-card class="surface-card" rounded="xl">
    <v-card-text class="d-flex flex-column ga-4">
      <div class="d-flex justify-space-between align-center flex-wrap ga-3">
        <div>
          <h3 class="section-title">Processamento</h3>
          <p class="section-copy">{{ currentStep }}</p>
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
import type { ProjectStatus } from '@/types/project.types';

@Component
export default class ProjectStatusTimeline extends Vue {
  @Prop({ required: true })
  readonly status!: ProjectStatus;

  @Prop({ required: true })
  readonly progress!: number;

  @Prop({ required: true })
  readonly currentStep!: string;

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
}
</script>
