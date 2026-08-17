<template>
  <AppLayout>
    <section class="hero-banner create-hero">
      <div>
        <p class="page-eyebrow">Novo vídeo</p>
        <h2 class="page-title">O que você quer criar?</h2>
        <p class="page-subtitle">Comece com uma música ou descreva diretamente a cena que deseja gerar.</p>
      </div>
      <span class="step-indicator"><strong>1</strong> · Configuração</span>
    </section>

    <section class="surface-card form-card create-form">
      <form class="app-native-form" @submit.prevent="submit">
        <div class="generation-mode-grid">
          <button type="button" class="generation-mode-card" :class="{ 'generation-mode-card--active': generationMode === 'prompt' }" @click="generationMode = 'prompt'">
            <v-icon icon="mdi-text-box-edit-outline" size="28" />
            <strong>Descrever uma cena</strong>
            <span>Digite um prompt e gere o vídeo sem precisar enviar música.</span>
          </button>
          <button type="button" class="generation-mode-card" :class="{ 'generation-mode-card--active': generationMode === 'music' }" @click="generationMode = 'music'">
            <v-icon icon="mdi-music-note" size="28" />
            <strong>Usar uma música</strong>
            <span>Envie um MP3 ou WAV e crie o videoclipe a partir da faixa.</span>
          </button>
        </div>

        <div class="form-section-heading">
          <span>1</span>
          <div>
            <h3>Informações básicas</h3>
            <p>{{ generationMode === 'prompt' ? 'Descreva a cena e defina sua duração.' : 'Prepare o projeto antes de enviar a música.' }}</p>
          </div>
        </div>

        <label class="auth-input-group">
          <span class="auth-input-label">Nome do vídeo</span>
          <input v-model="title" class="auth-input" type="text" placeholder="Ex.: Cidade do futuro" autofocus />
        </label>

        <label v-if="generationMode === 'prompt'" class="auth-input-group">
          <span class="auth-input-label">Descreva a cena</span>
          <textarea v-model="generationPrompt" class="auth-input auth-input--textarea" rows="8" placeholder="Ex.: Uma astronauta caminha por uma floresta bioluminescente à noite, câmera acompanhando de lado, estilo cinematográfico e realista." />
          <span class="field-help">Inclua ambiente, personagem, ação, estilo visual, iluminação e movimento de câmera.</span>
        </label>

        <label v-else class="auth-input-group">
          <span class="auth-input-label">Letra da música <small>Opcional, mas recomendado</small></span>
          <textarea v-model="manualLyricsText" class="auth-input auth-input--textarea" rows="8" placeholder="Cole a letra completa, incluindo marcações como [Verse], [Chorus] e [Bridge]." />
          <span class="field-help">Com a letra original, as cenas ficam mais fiéis à história da música.</span>
        </label>

        <label v-if="generationMode === 'prompt'" class="auth-input-group">
          <span class="auth-input-label">Duração do vídeo em segundos</span>
          <select v-model="clipDurationSecondsInput" class="auth-input">
            <option value="" disabled>Selecione a duração</option>
            <option :value="2">2 segundos</option>
            <option :value="3">3 segundos</option>
            <option :value="5">5 segundos</option>
          </select>
        </label>

        <label v-if="generationMode === 'prompt'" class="test-toggle">
          <input v-model="stabilityTest" type="checkbox" />
          <span>
            <strong>Minimal Motion / Stability Test</strong>
            <small>Câmera fixa, movimento mínimo e preservação de identidade, anatomia e cenário.</small>
          </span>
        </label>

        <details class="advanced-settings">
          <summary>
            <span><v-icon icon="mdi-tune-variant" size="20" /> Configurações avançadas</span>
            <v-icon icon="mdi-chevron-down" size="20" />
          </summary>
          <div class="advanced-settings__body">
            <label v-if="generationMode === 'prompt'" class="auth-input-group">
              <span class="auth-input-label">Seed reproduzível</span>
              <input v-model="generationSeedInput" class="auth-input" type="number" min="0" max="2147483646" step="1" placeholder="Aleatório" />
              <span class="field-help">Vazio gera um seed aleatório, que será salvo nos detalhes.</span>
            </label>
            <label v-if="generationMode === 'prompt'" class="auth-input-group">
              <span class="auth-input-label">CFG</span>
              <input v-model="generationCfgInput" class="auth-input" type="number" min="1" max="20" step="0.1" placeholder="Padrão do ambiente" />
            </label>
            <label v-if="generationMode === 'prompt'" class="auth-input-group">
              <span class="auth-input-label">Steps</span>
              <input v-model="generationStepsInput" class="auth-input" type="number" min="1" max="100" step="1" placeholder="Padrão do ambiente" />
            </label>
            <label v-if="generationMode === 'prompt'" class="test-toggle test-toggle--compact">
              <input v-model="wanOnly" type="checkbox" />
              <span><strong>ComfyUI / Wan only</strong><small>Falhar sem fallback caso o Wan não gere o vídeo.</small></span>
            </label>
            <label v-if="generationMode === 'music'" class="auth-input-group">
              <span class="auth-input-label">Duração total do teste</span>
              <input v-model="clipDurationSecondsInput" class="auth-input" type="number" min="1" max="600" step="1" placeholder="Vídeo completo" />
              <span class="field-help">Deixe vazio para usar a música inteira.</span>
            </label>
            <label class="auth-input-group">
              <span class="auth-input-label">Duração aproximada de cada cena</span>
              <input v-model="sceneDurationSecondsInput" class="auth-input" type="number" min="3" max="30" step="1" placeholder="6 segundos" />
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
        <v-alert v-if="submitted && !normalizedTitle" type="warning" variant="tonal">Informe um título para criar o projeto.</v-alert>
        <v-alert v-if="submitted && generationMode === 'prompt' && normalizedGenerationPrompt.length < 10" type="warning" variant="tonal">Descreva a cena com pelo menos 10 caracteres.</v-alert>
        <v-alert v-if="submitted && clipDurationSecondsRawValue && normalizedClipDurationSeconds === null" type="warning" variant="tonal">Informe uma duração entre 1 e 600 segundos.</v-alert>
        <v-alert v-if="submitted && generationMode === 'prompt' && normalizedClipDurationSeconds === null" type="warning" variant="tonal">A duração é obrigatória para gerar pela descrição.</v-alert>
        <v-alert v-if="submitted && sceneDurationSecondsRawValue && normalizedSceneDurationSeconds === null" type="warning" variant="tonal">Informe uma duração por cena entre 3 e 30 segundos.</v-alert>
        <v-alert v-if="submitted && generationSeedRawValue && normalizedGenerationSeed === null" type="warning" variant="tonal">Informe um seed inteiro entre 0 e 2147483646.</v-alert>
        <v-alert v-if="submitted && generationCfgRawValue && normalizedGenerationCfg === null" type="warning" variant="tonal">Informe um CFG entre 1 e 20.</v-alert>
        <v-alert v-if="submitted && generationStepsRawValue && normalizedGenerationSteps === null" type="warning" variant="tonal">Informe steps entre 1 e 100.</v-alert>

        <div class="app-button-row">
          <button class="app-button app-button--large" type="submit" :disabled="loading">
            {{ loading ? 'Preparando...' : generationMode === 'prompt' ? 'Gerar vídeo' : 'Continuar para o upload' }}
            <v-icon v-if="!loading" icon="mdi-arrow-right" size="19" />
          </button>
          <button class="app-button app-button--outline" type="button" @click="cancel">Cancelar</button>
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

@Component({ components: { AppLayout } })
export default class CreateProjectPage extends Vue {
  generationMode: 'music' | 'prompt' = 'prompt';
  generationPrompt = '';
  title = '';
  clipDurationSecondsInput: string | number = '';
  sceneDurationSecondsInput: string | number = '';
  visualCheckpointName = '';
  manualLyricsText = '';
  stabilityTest = false;
  wanOnly = true;
  generationSeedInput: string | number = '';
  generationCfgInput: string | number = '';
  generationStepsInput: string | number = '';
  loading = false;
  errorMessage: string | null = null;
  submitted = false;

  get authStore(): any { return useAuthStore(); }
  get projectsStore(): any { return useProjectsStore(); }
  get normalizedTitle(): string { return this.title.trim(); }
  get normalizedGenerationPrompt(): string { return this.generationPrompt.trim(); }
  get normalizedManualLyricsText(): string | null { return this.manualLyricsText.trim() || null; }
  get normalizedVisualCheckpointName(): string | null { return this.visualCheckpointName.trim() || null; }
  get clipDurationSecondsRawValue(): string { return String(this.clipDurationSecondsInput ?? '').trim(); }
  get sceneDurationSecondsRawValue(): string { return String(this.sceneDurationSecondsInput ?? '').trim(); }
  get generationSeedRawValue(): string { return String(this.generationSeedInput ?? '').trim(); }
  get generationCfgRawValue(): string { return String(this.generationCfgInput ?? '').trim(); }
  get generationStepsRawValue(): string { return String(this.generationStepsInput ?? '').trim(); }

  get normalizedClipDurationSeconds(): number | null {
    const value = Number(this.clipDurationSecondsRawValue);
    return this.clipDurationSecondsRawValue && Number.isFinite(value) && value >= 1 && value <= 600 ? Math.floor(value) : null;
  }

  get normalizedSceneDurationSeconds(): number | null {
    const value = Number(this.sceneDurationSecondsRawValue);
    return this.sceneDurationSecondsRawValue && Number.isFinite(value) && value >= 3 && value <= 30 ? Math.floor(value) : null;
  }

  get normalizedGenerationSeed(): number | null {
    const value = Number(this.generationSeedRawValue);
    return this.generationSeedRawValue && Number.isInteger(value) && value >= 0 && value <= 2147483646 ? value : null;
  }

  get normalizedGenerationCfg(): number | null {
    const value = Number(this.generationCfgRawValue);
    return this.generationCfgRawValue && Number.isFinite(value) && value >= 1 && value <= 20 ? value : null;
  }

  get normalizedGenerationSteps(): number | null {
    const value = Number(this.generationStepsRawValue);
    return this.generationStepsRawValue && Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
  }

  async submit() {
    if (!this.authStore.token) return;
    this.submitted = true;

    const invalidPromptMode = this.generationMode === 'prompt' && (this.normalizedGenerationPrompt.length < 10 || this.normalizedClipDurationSeconds === null);
    if (!this.normalizedTitle || invalidPromptMode || (this.clipDurationSecondsRawValue && this.normalizedClipDurationSeconds === null) || (this.sceneDurationSecondsRawValue && this.normalizedSceneDurationSeconds === null) || (this.generationSeedRawValue && this.normalizedGenerationSeed === null) || (this.generationCfgRawValue && this.normalizedGenerationCfg === null) || (this.generationStepsRawValue && this.normalizedGenerationSteps === null)) return;

    this.loading = true;
    this.errorMessage = null;
    try {
      const project = await this.projectsStore.createProject({
        title: this.normalizedTitle,
        generationMode: this.generationMode,
        generationPrompt: this.generationMode === 'prompt' ? this.normalizedGenerationPrompt : null,
        stabilityTest: this.generationMode === 'prompt' && this.stabilityTest,
        wanOnly: this.generationMode === 'prompt' && this.wanOnly,
        generationSeed: this.generationMode === 'prompt' ? this.normalizedGenerationSeed : null,
        generationCfg: this.generationMode === 'prompt' ? this.normalizedGenerationCfg : null,
        generationSteps: this.generationMode === 'prompt' ? this.normalizedGenerationSteps : null,
        clipDurationSeconds: this.normalizedClipDurationSeconds,
        sceneDurationSeconds: this.normalizedSceneDurationSeconds,
        visualCheckpointName: this.normalizedVisualCheckpointName,
        manualLyricsText: this.generationMode === 'music' ? this.normalizedManualLyricsText : null
      }, this.authStore.token);
      void this.$router.push({ name: this.generationMode === 'prompt' ? 'processing' : 'project-detail', params: { id: project.id } });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao criar projeto';
    } finally {
      this.loading = false;
    }
  }

  cancel() { void this.$router.push({ name: 'dashboard' }); }
}
</script>

<style scoped>
.create-hero, .create-form { width: min(860px, 100%); max-width: 860px; margin-right: auto; margin-left: auto; }
.step-indicator { color: #65676b; font-size: 0.84rem; white-space: nowrap; }
.step-indicator strong { color: #0866ff; }
.create-form { overflow: hidden; padding: 24px; }
.generation-mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.generation-mode-card { display: flex; min-height: 142px; flex-direction: column; align-items: flex-start; gap: 7px; padding: 18px; border: 2px solid #dfe3e8; border-radius: 14px; color: #25282d; background: #fff; text-align: left; cursor: pointer; transition: border-color 0.15s, background 0.15s, transform 0.15s; }
.generation-mode-card:hover { transform: translateY(-1px); border-color: #9fbff8; }
.generation-mode-card--active { border-color: #0866ff; background: #f2f7ff; box-shadow: 0 0 0 1px #0866ff; }
.generation-mode-card strong { font-size: 1rem; }
.generation-mode-card span { color: #65676b; font-size: 0.82rem; line-height: 1.45; }
.form-section-heading { display: flex; align-items: flex-start; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid #e4e6eb; }
.form-section-heading > span { display: inline-flex; width: 34px; height: 34px; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 50%; color: #fff; background: #0866ff; font-weight: 800; }
.form-section-heading h3, .form-section-heading p { margin: 0; }
.form-section-heading p, .field-help { color: #65676b; font-size: 0.8rem; }
.auth-input-label small { color: #65676b; font-weight: 500; }
.test-toggle { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border: 1px solid #b9cdf4; border-radius: 12px; background: #f2f7ff; cursor: pointer; }
.test-toggle input { margin-top: 3px; }
.test-toggle span { display: flex; flex-direction: column; gap: 3px; }
.test-toggle small { color: #65676b; line-height: 1.4; }
.test-toggle--compact { align-self: end; background: #fff; }
.advanced-settings { border: 1px solid #dfe3e8; border-radius: 12px; background: #f7f8fa; }
.advanced-settings summary { display: flex; align-items: center; justify-content: space-between; padding: 15px 16px; cursor: pointer; font-weight: 700; list-style: none; }
.advanced-settings summary span { display: flex; align-items: center; gap: 8px; }
.advanced-settings__body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 4px 16px 18px; }
@media (max-width: 640px) { .create-form { padding: 18px; } .generation-mode-grid, .advanced-settings__body { grid-template-columns: 1fr; } }
</style>
