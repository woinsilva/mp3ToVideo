<template>
  <AppLayout>
    <section class="hero-banner children-hero">
      <div>
        <p class="page-eyebrow">Novo clipe infantil</p>
        <h2 class="page-title">Prepare a musica e a direcao criativa</h2>
        <p class="page-subtitle">A musica final do Suno sera a base temporal de todo o clipe.</p>
      </div>
      <span class="step-indicator"><strong>1</strong> · Preparacao</span>
    </section>

    <section class="surface-card children-form-card">
      <form class="app-native-form" @submit.prevent="submit">
        <div class="section-heading">
          <span>1</span>
          <div>
            <h3>Projeto e musica</h3>
            <p>O arquivo deve estar finalizado e ter no maximo quatro minutos.</p>
          </div>
        </div>

        <label class="auth-input-group">
          <span class="auth-input-label">Nome do clipe</span>
          <input v-model="title" class="auth-input" type="text" placeholder="Ex.: A festa dos bichinhos" autofocus />
        </label>

        <label class="auth-input-group">
          <span class="auth-input-label">Musica pronta do Suno</span>
          <input class="auth-input" type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" @change="onTrackSelected" />
          <span class="field-help">MP3 ou WAV. A duracao real sera validada antes da producao e nao podera ultrapassar 240 segundos.</span>
        </label>

        <label class="auth-input-group">
          <span class="auth-input-label">Letra original</span>
          <textarea v-model="lyrics" class="auth-input auth-input--textarea" rows="8" placeholder="Cole a letra completa, incluindo [Verse], [Chorus] e outras marcacoes do Suno." />
          <span class="field-help">A letra original melhora roteiro, cortes e sincronizacao labial.</span>
        </label>

        <div class="section-heading">
          <span>2</span>
          <div>
            <h3>Direcao criativa</h3>
            <p>Estas regras orientarao personagens, storyboard e animacao.</p>
          </div>
        </div>

        <label class="auth-input-group">
          <span class="auth-input-label">Conceito ou historia do clipe</span>
          <textarea v-model="concept" class="auth-input auth-input--textarea" rows="6" placeholder="Ex.: Um grupo de animais aprende a plantar e cuidar de uma horta enquanto canta." />
        </label>

        <label class="auth-input-group">
          <span class="auth-input-label">Estilo visual</span>
          <textarea v-model="visualStyle" class="auth-input auth-input--textarea" rows="4" placeholder="Ex.: Animacao 2D infantil original, formas arredondadas, cores alegres e fundos simples." />
        </label>

        <div class="field-grid">
          <label class="auth-input-group">
            <span class="auth-input-label">Idade minima</span>
            <input v-model.number="audienceAgeMin" class="auth-input" type="number" min="1" max="17" />
          </label>
          <label class="auth-input-group">
            <span class="auth-input-label">Idade maxima</span>
            <input v-model.number="audienceAgeMax" class="auth-input" type="number" min="1" max="17" />
          </label>
          <label class="auth-input-group">
            <span class="auth-input-label">Formato</span>
            <select v-model="aspectRatio" class="auth-input">
              <option value="landscape_16_9">16:9 · YouTube</option>
              <option value="portrait_9_16">9:16 · Vertical</option>
              <option value="square_1_1">1:1 · Quadrado</option>
            </select>
          </label>
        </div>

        <v-alert v-if="submitted && validationMessage" type="warning" variant="tonal">{{ validationMessage }}</v-alert>
        <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

        <div class="form-actions">
          <button class="app-button app-button--secondary" type="button" :disabled="loading" @click="cancel">Cancelar</button>
          <button class="app-button" type="submit" :disabled="loading">
            {{ loading ? 'Preparando estudio...' : 'Criar e abrir estudio de personagens' }}
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
import type { ChildrenClipAspectRatio } from '@/types/project.types';

@Component({ components: { AppLayout } })
export default class CreateChildrenClipPage extends Vue {
  title = '';
  lyrics = '';
  concept = '';
  visualStyle = 'Animacao 2D infantil original, colorida, acolhedora e com formas arredondadas.';
  audienceAgeMin = 2;
  audienceAgeMax = 7;
  aspectRatio: ChildrenClipAspectRatio = 'landscape_16_9';
  trackFile: File | null = null;
  submitted = false;
  loading = false;
  errorMessage: string | null = null;

  get authStore(): any { return useAuthStore(); }
  get projectsStore(): any { return useProjectsStore(); }
  get normalizedTitle() { return this.title.trim(); }
  get normalizedLyrics() { return this.lyrics.trim(); }
  get normalizedConcept() { return this.concept.trim(); }
  get normalizedVisualStyle() { return this.visualStyle.trim(); }

  get validationMessage(): string | null {
    if (this.normalizedTitle.length < 2) return 'Informe um nome para o clipe.';
    if (!this.trackFile) return 'Selecione a musica pronta em MP3 ou WAV.';
    if (!/\.(mp3|wav)$/i.test(this.trackFile.name)) return 'A musica deve estar em MP3 ou WAV.';
    if (this.normalizedLyrics.length < 10) return 'Cole a letra original da musica com pelo menos 10 caracteres.';
    if (this.normalizedConcept.length < 10) return 'Descreva o conceito do clipe com pelo menos 10 caracteres.';
    if (this.normalizedVisualStyle.length < 3) return 'Descreva o estilo visual.';
    if (this.audienceAgeMin < 1 || this.audienceAgeMax > 17 || this.audienceAgeMin > this.audienceAgeMax) return 'Revise a faixa etaria.';
    return null;
  }

  onTrackSelected(event: Event) {
    this.trackFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  async submit() {
    if (!this.authStore.token) return;
    this.submitted = true;
    if (this.validationMessage || !this.trackFile) return;

    this.loading = true;
    this.errorMessage = null;
    try {
      const project = await this.projectsStore.createProject({
        title: this.normalizedTitle,
        generationMode: 'children_clip',
        generationPrompt: null,
        stabilityTest: false,
        wanOnly: false,
        generationSeed: null,
        generationCfg: null,
        generationSteps: null,
        generationFps: 24,
        frameInterpolationMode: 'off',
        clipDurationSeconds: null,
        sceneDurationSeconds: null,
        visualCheckpointName: null,
        manualLyricsText: this.normalizedLyrics,
        childrenClipConcept: this.normalizedConcept,
        childrenClipVisualStyle: this.normalizedVisualStyle,
        audienceAgeMin: this.audienceAgeMin,
        audienceAgeMax: this.audienceAgeMax,
        childrenClipAspectRatio: this.aspectRatio
      }, this.authStore.token);

      await this.projectsStore.uploadTrack(
        project.id,
        this.trackFile,
        null,
        null,
        null,
        this.normalizedLyrics,
        this.authStore.token
      );
      void this.$router.push({ name: 'children-clip-studio', params: { id: project.id } });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao criar o clipe infantil';
    } finally {
      this.loading = false;
    }
  }

  cancel() { void this.$router.push({ name: 'create-project' }); }
}
</script>

<style scoped>
.children-hero, .children-form-card { width: min(920px, 100%); margin-right: auto; margin-left: auto; }
.children-form-card { padding: 24px; }
.step-indicator { color: #65676b; font-size: 0.84rem; white-space: nowrap; }
.step-indicator strong { color: #e98b17; }
.section-heading { display: flex; align-items: flex-start; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #e4e6eb; }
.section-heading > span { display: inline-flex; width: 34px; height: 34px; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 50%; color: #fff; background: #e98b17; font-weight: 800; }
.section-heading h3, .section-heading p { margin: 0; }
.section-heading p, .field-help { color: #65676b; font-size: 0.82rem; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 14px; }
@media (max-width: 700px) { .children-form-card { padding: 18px; } .field-grid { grid-template-columns: 1fr; } }
</style>
