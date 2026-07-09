<template>
  <v-card class="surface-card scene-panel" rounded="xl">
    <v-card-text>
      <div class="scene-panel__heading">
        <div>
          <h3 class="section-title">Cenas do videoclipe</h3>
          <p class="section-copy">{{ scenes.length }} cenas organizadas na sequência final.</p>
        </div>
        <v-chip v-if="scenes.length" color="primary" variant="tonal">
          {{ formatRange(0, totalDuration) }}
        </v-chip>
      </div>

      <div v-if="!scenes.length" class="scene-empty">
        <v-icon icon="mdi-image-multiple-outline" size="36" />
        <strong>As cenas aparecerão aqui</strong>
        <span>Elas serão exibidas quando a geração estiver concluída.</span>
      </div>

      <div v-else class="scene-grid">
        <article v-for="scene in scenes" :key="scene.id" class="scene-card">
          <div class="scene-thumbnail">
            <span>{{ scene.index + 1 }}</span>
            <v-icon icon="mdi-image-outline" size="30" />
            <small>{{ formatRange(scene.startSeconds, scene.endSeconds) }}</small>
          </div>
          <div class="scene-card__body">
            <div class="scene-card__title">
              <h4>{{ scene.title }}</h4>
              <v-chip :color="scene.status === 'completed' ? 'success' : 'primary'" size="x-small" variant="tonal">
                {{ formatStatus(scene.status) }}
              </v-chip>
            </div>
            <p>{{ scene.description }}</p>
          </div>
        </article>
      </div>
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

  get totalDuration(): number {
    return this.scenes.length ? Math.max(...this.scenes.map((scene) => scene.endSeconds)) : 0;
  }

  formatRange(startSeconds: number, endSeconds: number): string {
    return `${this.formatTime(startSeconds)} – ${this.formatTime(endSeconds)}`;
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
  }

  formatStatus(status: string): string {
    if (status === 'completed') return 'Pronta';
    if (status === 'failed') return 'Falhou';
    if (status === 'generating') return 'Gerando';
    return status;
  }
}
</script>

<style scoped>
.scene-panel {
  padding: 8px;
}

.scene-panel__heading,
.scene-card__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.scene-panel__heading {
  margin-bottom: 18px;
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.scene-card {
  display: grid;
  overflow: hidden;
  grid-template-columns: 130px minmax(0, 1fr);
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  background: #fff;
}

.scene-thumbnail {
  position: relative;
  display: flex;
  min-height: 126px;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.82);
  background: linear-gradient(145deg, #0866ff, #073b90);
}

.scene-thumbnail > span {
  position: absolute;
  top: 9px;
  left: 9px;
  display: inline-flex;
  width: 25px;
  height: 25px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #0866ff;
  background: #fff;
  font-size: 0.73rem;
  font-weight: 800;
}

.scene-thumbnail small {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 3px 6px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.55);
  font-size: 0.67rem;
}

.scene-card__body {
  min-width: 0;
  padding: 13px;
}

.scene-card h4 {
  margin: 1px 0 0;
  overflow: hidden;
  font-size: 0.88rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-card p {
  display: -webkit-box;
  margin: 9px 0 0;
  overflow: hidden;
  color: #65676b;
  font-size: 0.76rem;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.scene-empty {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-direction: column;
  border: 1px dashed #bec3c9;
  border-radius: 12px;
  color: #65676b;
  background: #f7f8fa;
}

.scene-empty strong {
  color: #1c1e21;
}

@media (max-width: 900px) {
  .scene-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .scene-card { grid-template-columns: 96px minmax(0, 1fr); }
}
</style>
