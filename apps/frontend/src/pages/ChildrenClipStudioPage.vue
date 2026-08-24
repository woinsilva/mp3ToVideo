<template>
  <AppLayout>
    <section class="hero-banner studio-hero">
      <div>
        <p class="page-eyebrow">Estudio de clipe infantil</p>
        <h2 class="page-title">{{ project?.title || 'Carregando projeto...' }}</h2>
        <p class="page-subtitle">Prepare personagens e identidade visual antes de produzir o storyboard.</p>
      </div>
      <span v-if="project?.childrenClip" class="status-pill">{{ productionStatusLabel }}</span>
    </section>

    <v-alert v-if="errorMessage" class="studio-width" type="error" variant="tonal">{{ errorMessage }}</v-alert>

    <template v-if="project?.childrenClip">
      <section class="studio-width setup-grid">
        <article class="surface-card setup-card">
          <span class="setup-card__icon"><v-icon icon="mdi-music-note" /></span>
          <div><strong>Musica e letra</strong><p>Arquivo recebido e letra original registrada.</p></div>
          <v-icon icon="mdi-check-circle" color="success" />
        </article>
        <article class="surface-card setup-card">
          <span class="setup-card__icon"><v-icon icon="mdi-palette-outline" /></span>
          <div><strong>Direcao visual</strong><p>{{ project.childrenClip.visualStyle }}</p></div>
          <v-icon icon="mdi-check-circle" color="success" />
        </article>
      </section>

      <section class="surface-card studio-width character-panel">
        <div class="panel-heading">
          <div>
            <p class="page-eyebrow">Proxima etapa</p>
            <h3>Personagens</h3>
            <p>Gere personagens por descricao ou envie imagens de referencia para cada um.</p>
          </div>
          <span class="step-number">2</span>
        </div>

        <div class="character-options">
          <article>
            <v-icon icon="mdi-auto-fix" size="32" />
            <strong>Gerar por descricao</strong>
            <p>Criaremos ficha, angulos, expressoes, poses e formas de boca usando o ComfyUI do Windows.</p>
          </article>
          <article>
            <v-icon icon="mdi-image-plus-outline" size="32" />
            <strong>Enviar imagens</strong>
            <p>Use uma referencia principal e, opcionalmente, outros angulos, expressoes e poses.</p>
          </article>
        </div>

        <v-alert type="info" variant="tonal">
          A fundacao do projeto foi criada sem iniciar o pipeline Wan antigo. O cadastro e o versionamento de personagens serao conectados nesta etapa do estudio.
        </v-alert>
      </section>
    </template>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';

@Component({ components: { AppLayout } })
export default class ChildrenClipStudioPage extends Vue {
  errorMessage: string | null = null;
  get authStore(): any { return useAuthStore(); }
  get projectsStore(): any { return useProjectsStore(); }
  get project() { return this.projectsStore.currentProject; }
  get projectId() { return String(this.$route.params.id); }
  get productionStatusLabel() {
    return this.project?.childrenClip?.productionStatus === 'setup' ? 'Preparacao' : this.project?.childrenClip?.productionStatus;
  }

  async mounted() {
    if (!this.authStore.token) return;
    try {
      const project = await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      if (project.generationMode !== 'children_clip') {
        void this.$router.replace({ name: 'project-detail', params: { id: project.id } });
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao carregar o estudio';
    }
  }
}
</script>

<style scoped>
.studio-width, .studio-hero { width: min(1040px, 100%); margin-right: auto; margin-left: auto; }
.status-pill { padding: 8px 12px; border-radius: 999px; color: #92520a; background: #fff0d4; font-size: 0.82rem; font-weight: 800; }
.setup-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.setup-card { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 18px; }
.setup-card__icon { display: inline-flex; width: 42px; height: 42px; align-items: center; justify-content: center; border-radius: 12px; color: #9b5d0b; background: #fff0d4; }
.setup-card p, .character-panel p { margin: 4px 0 0; color: #65676b; }
.character-panel { padding: 24px; }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.panel-heading h3 { margin: 0; font-size: 1.35rem; }
.step-number { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 50%; color: #fff; background: #e98b17; font-weight: 800; }
.character-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 22px 0; }
.character-options article { display: flex; min-height: 150px; flex-direction: column; gap: 8px; padding: 20px; border: 1px solid #e1e4e8; border-radius: 14px; background: #fafbfc; }
.character-options article > .v-icon { color: #e98b17; }
@media (max-width: 700px) { .setup-grid, .character-options { grid-template-columns: 1fr; } .character-panel { padding: 18px; } }
</style>
