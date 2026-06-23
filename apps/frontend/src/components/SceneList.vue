<template>
  <v-card class="surface-card" rounded="xl">
    <v-card-text>
      <div class="d-flex justify-space-between align-center mb-4">
        <div>
          <h3 class="section-title">Cenas geradas</h3>
          <p class="section-copy">Cada cena cobre um trecho curto da musica.</p>
        </div>
      </div>

      <v-alert v-if="!scenes.length" type="info" variant="tonal" class="mb-4">
        As cenas aparecem aqui quando a geracao do clipe for concluida.
      </v-alert>

      <v-list v-else class="bg-transparent pa-0">
        <v-list-item v-for="scene in scenes" :key="scene.id" class="scene-item" rounded="xl">
          <template #prepend>
            <v-avatar color="secondary" variant="tonal">{{ scene.index + 1 }}</v-avatar>
          </template>
          <v-list-item-title>{{ scene.title }}</v-list-item-title>
          <v-list-item-subtitle>
            {{ formatRange(scene.startSeconds, scene.endSeconds) }} | {{ scene.description }}
          </v-list-item-subtitle>
          <template #append>
            <v-chip size="small" variant="tonal">{{ scene.status }}</v-chip>
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

import type { ProjectScene } from '@/types/project.types';

@Component
export default class SceneList extends Vue {
  @Prop({ required: true })
  readonly scenes!: ProjectScene[];

  formatRange(startSeconds: number, endSeconds: number): string {
    return `${startSeconds.toFixed(1)}s - ${endSeconds.toFixed(1)}s`;
  }
}
</script>
