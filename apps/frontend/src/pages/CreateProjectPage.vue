<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Novo projeto</p>
        <h2 class="page-title">Criar videoclipe</h2>
        <p class="page-subtitle">Defina o titulo do projeto e, se quiser, limite o clipe aos primeiros segundos da musica.</p>
      </div>
    </section>

    <v-card class="surface-card form-card" rounded="xl">
      <v-card-text>
        <form class="app-native-form" @submit.prevent="submit">
          <label class="auth-input-group">
            <span class="auth-input-label">Titulo do projeto</span>
            <input
              v-model="title"
              class="auth-input"
              type="text"
              placeholder="Ex.: Clip da musica X"
            />
          </label>
          <label class="auth-input-group">
            <span class="auth-input-label">Gerar apenas os primeiros segundos</span>
            <input
              v-model="clipDurationSecondsInput"
              class="auth-input"
              type="number"
              min="1"
              max="600"
              step="1"
              placeholder="Opcional. Ex.: 20"
            />
          </label>
          <v-alert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</v-alert>

          <v-alert v-if="submitted && !normalizedTitle" type="warning" variant="tonal">
            Informe um titulo para criar o projeto.
          </v-alert>
          <v-alert
            v-if="submitted && clipDurationSecondsInput.trim() && normalizedClipDurationSeconds === null"
            type="warning"
            variant="tonal"
          >
            Informe uma duracao entre 1 e 600 segundos.
          </v-alert>

          <div class="app-button-row">
            <button class="app-button" type="submit" :disabled="loading">
              {{ loading ? 'Criando projeto...' : 'Criar projeto' }}
            </button>
            <button class="app-button app-button--outline" type="button" @click="cancel">
              Cancelar
            </button>
          </div>
        </form>
      </v-card-text>
    </v-card>
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
  clipDurationSecondsInput = '';
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

  get normalizedClipDurationSeconds(): number | null {
    const rawValue = this.clipDurationSecondsInput.trim();

    if (!rawValue) {
      return null;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 600) {
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
      (this.clipDurationSecondsInput.trim() && this.normalizedClipDurationSeconds === null)
    ) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      const project = await this.projectsStore.createProject(
        this.normalizedTitle,
        this.normalizedClipDurationSeconds,
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
