<template>
  <AppLayout>
    <section class="hero-banner create-hero">
      <div>
        <p class="page-eyebrow">Novo videoclipe</p>
        <h2 class="page-title">Vamos começar</h2>
        <p class="page-subtitle">Dê um nome ao projeto. Na próxima etapa você enviará a música.</p>
      </div>
      <span class="step-indicator"><strong>1</strong> de 2 · Configuração</span>
    </section>

    <section class="surface-card form-card create-form">
      <form class="app-native-form" @submit.prevent="submit">
          <div class="form-section-heading">
            <span>1</span>
            <div>
              <h3>Informações básicas</h3>
              <p>Você poderá alterar as opções antes de iniciar a geração.</p>
            </div>
          </div>
          <label class="auth-input-group">
            <span class="auth-input-label">Nome do videoclipe</span>
            <input
              v-model="title"
              class="auth-input"
              type="text"
              placeholder="Ex.: Caiu o salário"
              autofocus
            />
          </label>

          <label class="auth-input-group">
            <span class="auth-input-label">Letra da música <small>Opcional, mas recomendado</small></span>
            <textarea
              v-model="manualLyricsText"
              class="auth-input auth-input--textarea"
              rows="8"
              placeholder="Cole a letra completa, incluindo marcações como [Verse], [Chorus] e [Bridge]."
            />
            <span class="field-help">Com a letra original, as cenas ficam mais fiéis à história da música.</span>
          </label>

          <details class="advanced-settings">
            <summary>
              <span><v-icon icon="mdi-tune-variant" size="20" /> Configurações avançadas</span>
              <v-icon icon="mdi-chevron-down" size="20" />
            </summary>
            <div class="advanced-settings__body">
              <label class="auth-input-group">
                <span class="auth-input-label">Duração total do teste</span>
                <input v-model="clipDurationSecondsInput" class="auth-input" type="number" min="1" max="600" step="1" placeholder="Vídeo completo" />
                <span class="field-help">Deixe vazio para usar a música inteira.</span>
              </label>
              <label class="auth-input-group">
                <span class="auth-input-label">Duração aproximada de cada cena</span>
                <input v-model="sceneDurationSecondsInput" class="auth-input" type="number" min="3" max="30" step="1" placeholder="5 segundos" />
              </label>
              <label class="auth-input-group">
                <span class="auth-input-label">Modelo visual</span>
                <select v-model="visualCheckpointName" class="auth-input">
                  <option value="">Automático (recomendado)</option>
                  <option value="sd_xl_turbo_1.0.safetensors">SDXL Turbo</option>
                </select>
              </label>
            </div>
          </details>
          <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

          <v-alert v-if="submitted && !normalizedTitle" type="warning" variant="tonal">
            Informe um título para criar o projeto.
          </v-alert>
          <v-alert
            v-if="submitted && clipDurationSecondsRawValue && normalizedClipDurationSeconds === null"
            type="warning"
            variant="tonal"
          >
            Informe uma duração entre 1 e 600 segundos.
          </v-alert>
          <v-alert
            v-if="submitted && sceneDurationSecondsRawValue && normalizedSceneDurationSeconds === null"
            type="warning"
            variant="tonal"
          >
            Informe uma duração por cena entre 3 e 30 segundos.
          </v-alert>

          <div class="app-button-row">
            <button class="app-button app-button--large" type="submit" :disabled="loading">
              {{ loading ? 'Preparando...' : 'Continuar para o upload' }}
              <v-icon v-if="!loading" icon="mdi-arrow-right" size="19" />
            </button>
            <button class="app-button app-button--outline" type="button" @click="cancel">
              Cancelar
            </button>
          </div>
      </form>
    </section>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';

@Component({
  components: {
    AppLayout
  }
})
export default class CreateProjectPage extends Vue {
  title = '';
  clipDurationSecondsInput: string | number = '';
  sceneDurationSecondsInput: string | number = '';
  visualCheckpointName = '';
  manualLyricsText = '';
  loading = false;
  errorMessage: string | null = null;
  submitted = false;

  get authStore(): any {
    return useAuthStore();
  }

  get projectsStore(): any {
    return useProjectsStore();
  }

  get normalizedTitle(): string {
    return this.title.trim();
  }

  get normalizedManualLyricsText(): string | null {
    const rawValue = this.manualLyricsText.trim();
    return rawValue ? rawValue : null;
  }

  get normalizedVisualCheckpointName(): string | null {
    const rawValue = this.visualCheckpointName.trim();
    return rawValue ? rawValue : null;
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

  async submit() {
    if (!this.authStore.token) {
      return;
    }

    this.submitted = true;

    if (
      !this.normalizedTitle ||
      (this.clipDurationSecondsRawValue && this.normalizedClipDurationSeconds === null) ||
      (this.sceneDurationSecondsRawValue && this.normalizedSceneDurationSeconds === null)
    ) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      const project = await this.projectsStore.createProject(
        this.normalizedTitle,
        this.normalizedClipDurationSeconds,
        this.normalizedSceneDurationSeconds,
        this.normalizedVisualCheckpointName,
        this.normalizedManualLyricsText,
        this.authStore.token
      );
      void this.$router.push({ name: 'project-detail', params: { id: project.id } });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao criar projeto';
    } finally {
      this.loading = false;
    }
  }

  cancel() {
    void this.$router.push({ name: 'dashboard' });
  }
}
</script>

<style scoped>
.create-hero,
.create-form {
  width: min(860px, 100%);
  max-width: 860px;
  margin-right: auto;
  margin-left: auto;
}

.step-indicator {
  color: #65676b;
  font-size: 0.84rem;
  white-space: nowrap;
}

.step-indicator strong {
  color: #0866ff;
}

.create-form {
  overflow: hidden;
  padding: 24px;
}

.form-section-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 18px;
  border-bottom: 1px solid #e4e6eb;
}

.form-section-heading > span {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 50%;
  color: #fff;
  background: #0866ff;
  font-weight: 800;
}

.form-section-heading h3,
.form-section-heading p {
  margin: 0;
}

.form-section-heading p,
.field-help {
  color: #65676b;
  font-size: 0.8rem;
}

.auth-input-label small {
  color: #65676b;
  font-weight: 500;
}

.advanced-settings {
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  background: #f7f8fa;
}

.advanced-settings summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px;
  cursor: pointer;
  font-weight: 700;
  list-style: none;
}

.advanced-settings summary span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.advanced-settings__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 4px 16px 18px;
}

.advanced-settings__body label:last-child {
  grid-column: 1 / -1;
}

@media (max-width: 640px) {
  .create-form {
    padding: 18px;
  }

  .advanced-settings__body {
    grid-template-columns: 1fr;
  }

  .advanced-settings__body label:last-child {
    grid-column: auto;
  }
}
</style>
