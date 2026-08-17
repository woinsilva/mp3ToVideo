<template>
  <section class="surface-card scene-panel">
    <div>
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
            <div v-if="scene.attemptSummary" class="scene-attempt">
              <span>
                Tentativa {{ scene.attemptSummary.attemptNumber }} ·
                {{ formatAttemptStatus(scene.attemptSummary.latestAttemptStatus) }}
              </span>
              <strong>{{ formatAttemptElapsed(scene.attemptSummary.elapsedSeconds) }}</strong>
            </div>
            <details v-if="scene.attemptSummary" class="generation-details">
              <summary>Parâmetros da geração</summary>
              <dl>
                <div><dt>Provider</dt><dd>{{ scene.attemptSummary.provider }}</dd></div>
                <div><dt>Workflow</dt><dd>{{ scene.attemptSummary.workflowName ?? '--' }}</dd></div>
                <div><dt>Modelo</dt><dd>{{ scene.attemptSummary.unetName ?? '--' }}</dd></div>
                <div><dt>Seed</dt><dd>{{ scene.attemptSummary.seed ?? '--' }}</dd></div>
                <div><dt>CFG / Steps</dt><dd>{{ scene.attemptSummary.cfg ?? '--' }} / {{ scene.attemptSummary.steps ?? '--' }}</dd></div>
                <div><dt>Sampler</dt><dd>{{ scene.attemptSummary.sampler ?? '--' }} · {{ scene.attemptSummary.scheduler ?? '--' }}</dd></div>
                <div><dt>Resolução</dt><dd>{{ formatResolution(scene) }}</dd></div>
                <div><dt>FPS / Frames</dt><dd>{{ scene.attemptSummary.fps ?? '--' }} / {{ scene.attemptSummary.frameCount ?? '--' }}</dd></div>
                <div><dt>Duração</dt><dd>{{ formatGenerationDuration(scene) }}</dd></div>
              </dl>
              <div class="generation-prompt"><strong>Prompt positivo final</strong><p>{{ scene.attemptSummary.positivePrompt ?? '--' }}</p></div>
              <div class="generation-prompt"><strong>Negative prompt final</strong><p>{{ scene.attemptSummary.negativePrompt ?? '--' }}</p></div>
            </details>
            <div class="scene-reference">
              <v-chip
                :color="scene.hasReferenceImage ? 'success' : 'default'"
                size="x-small"
                variant="tonal"
              >
                {{ scene.hasReferenceImage ? 'Referência adicionada' : 'Sem referência' }}
              </v-chip>
              <label class="scene-reference__button">
                <input
                  accept="image/jpeg,image/png,image/webp"
                  type="file"
                  @change="onReferenceImageSelected(scene.id, $event)"
                />
                {{ scene.hasReferenceImage ? 'Trocar imagem' : 'Adicionar imagem' }}
              </label>
            </div>
            <button
              v-if="scene.attemptSummary?.canRetryAttempt"
              class="scene-retry-button"
              type="button"
              @click="retrySceneRender(scene.id)"
            >
              <v-icon icon="mdi-restart" size="16" />
              Reiniciar render desta cena
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

import type { ProjectScene } from '@/types/project.types';

@Component
export default class SceneList extends Vue {
  @Prop({ required: true })
  readonly scenes!: ProjectScene[];

  onReferenceImageSelected(sceneId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (!file) {
      return;
    }

    this.$emit('reference-upload', { sceneId, file });
  }

  retrySceneRender(sceneId: string) {
    this.$emit('retry-render', { sceneId });
  }

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

  formatAttemptStatus(status: string | null): string {
    if (!status) return 'sem tentativa';
    if (status === 'waiting_external') return 'aguardando ComfyUI';
    if (status === 'confirmed_external_active') return 'ComfyUI ativo';
    if (status === 'completed') return 'concluida';
    if (status === 'failed') return 'falhou';
    if (status === 'abandoned') return 'reiniciada';
    if (status === 'cancelled') return 'cancelada';
    return status;
  }

  formatAttemptElapsed(seconds: number | null): string {
    if (seconds === null) return '--';
    const safeValue = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeValue / 60);
    const remaining = safeValue % 60;
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
  }

  formatResolution(scene: ProjectScene): string {
    const attempt = scene.attemptSummary;
    return attempt?.width && attempt.height ? `${attempt.width}×${attempt.height}` : '--';
  }

  formatGenerationDuration(scene: ProjectScene): string {
    const attempt = scene.attemptSummary;
    if (!attempt?.requestedDurationSeconds) return '--';
    const requested = `${attempt.requestedDurationSeconds}s`;
    return attempt.effectiveDurationSeconds !== null && attempt.effectiveDurationSeconds !== attempt.requestedDurationSeconds
      ? `${requested} solicitada · ${attempt.effectiveDurationSeconds}s efetiva`
      : requested;
  }
}
</script>

<style scoped>
.scene-panel {
  overflow: hidden;
  padding: 24px;
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

.scene-reference {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
}

.scene-attempt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  background: #f7f8fa;
  color: #65676b;
  font-size: 0.72rem;
}

.scene-attempt strong {
  flex: 0 0 auto;
  color: #1c1e21;
}

.generation-details { margin-top: 9px; border: 1px solid #dfe3e8; border-radius: 8px; background: #fff; font-size: 0.72rem; }
.generation-details summary { padding: 8px 10px; color: #0866ff; cursor: pointer; font-weight: 800; }
.generation-details dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 10px; margin: 0; padding: 0 10px 10px; }
.generation-details dl div { min-width: 0; }
.generation-details dt { color: #65676b; }
.generation-details dd { margin: 2px 0 0; overflow-wrap: anywhere; font-weight: 700; }
.generation-prompt { margin: 0 10px 10px; padding-top: 8px; border-top: 1px solid #e4e6eb; }
.generation-prompt p { display: block; margin-top: 4px; overflow: visible; color: #4b4f56; -webkit-line-clamp: unset; }

.scene-retry-button {
  display: inline-flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  border: 1px solid #f4b740;
  border-radius: 8px;
  color: #7a4b00;
  background: #fff8e8;
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 800;
}

.scene-retry-button:hover {
  border-color: #d69200;
  background: #ffefc2;
}

.scene-reference__button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  color: #0866ff;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 800;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.scene-reference__button:hover {
  border-color: #0866ff;
  background: #eef4ff;
}

.scene-reference__button input {
  display: none;
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
  .scene-panel { padding: 18px; }
  .scene-card { grid-template-columns: 96px minmax(0, 1fr); }
}
</style>
