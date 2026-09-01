<template>
  <AppLayout>
    <section class="dashboard-heading">
      <div>
        <p class="page-eyebrow">Visão geral</p>
        <h2 class="page-title">Meus videoclipes</h2>
        <p class="page-subtitle">Acompanhe seus projetos e continue de onde parou.</p>
      </div>
      <button class="app-button app-button--large" type="button" @click="goToCreateProject">
        <v-icon icon="mdi-plus" size="21" />
        Criar videoclipe
      </button>
    </section>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-5">
      {{ errorMessage }}
    </v-alert>

    <section class="stats-grid" aria-label="Resumo dos projetos">
      <div class="stat-card">
        <span class="stat-icon stat-icon--blue"><v-icon icon="mdi-movie-open-outline" /></span>
        <span>
          <strong>{{ projects.length }}</strong>
          <small>Total de projetos</small>
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--amber"><v-icon icon="mdi-progress-clock" /></span>
        <span>
          <strong>{{ activeProjectsCount }}</strong>
          <small>Em produção</small>
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--green"><v-icon icon="mdi-check-circle-outline" /></span>
        <span>
          <strong>{{ completedProjectsCount }}</strong>
          <small>Concluídos</small>
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--red"><v-icon icon="mdi-alert-circle-outline" /></span>
        <span>
          <strong>{{ failedProjectsCount }}</strong>
          <small>Precisam de atenção</small>
        </span>
      </div>
    </section>

    <section class="projects-section">
      <div class="projects-toolbar">
        <div>
          <h3 class="section-title">Projetos recentes</h3>
          <p class="section-copy">Abra um projeto para ver detalhes ou acompanhar a geração.</p>
        </div>
        <label class="search-field">
          <v-icon icon="mdi-magnify" size="20" />
          <input v-model="search" type="search" placeholder="Buscar por nome" />
        </label>
      </div>

      <div v-if="loading" class="project-grid">
        <v-skeleton-loader v-for="index in 6" :key="index" type="card" class="project-skeleton" />
      </div>

      <div v-else-if="filteredProjects.length" class="project-grid">
        <article
          v-for="project in filteredProjects"
          :key="project.id"
          class="project-card-new"
          @click="openProject(project)"
        >
          <div class="project-cover" :class="coverClass(project.status)">
            <v-icon :icon="statusIcon(project.status)" size="34" />
            <span class="project-duration" v-if="project.clipDurationSeconds">
              {{ formatDuration(project.clipDurationSeconds) }}
            </span>
          </div>

          <div class="project-body">
            <div class="project-title-row">
              <h4>{{ project.title }}</h4>
              <v-chip :color="statusTone(project.status)" size="small" variant="tonal">
                {{ statusLabel(project.status) }}
              </v-chip>
            </div>

            <p class="project-date">
              <v-icon icon="mdi-clock-outline" size="16" />
              Atualizado {{ formatRelativeDate(project.updatedAt) }}
            </p>

            <div class="project-settings" v-if="project.sceneDurationSeconds">
              <span><v-icon icon="mdi-timeline-clock-outline" size="16" /> Cenas de {{ project.sceneDurationSeconds }}s</span>
            </div>

            <button
              class="app-button app-button--outline project-open-button"
              type="button"
              @click.stop="openProject(project)"
            >
              {{ openProjectLabel(project) }}
              <v-icon icon="mdi-arrow-right" size="18" />
            </button>
          </div>
        </article>
      </div>

      <div v-else class="dashboard-empty">
        <span class="dashboard-empty__icon"><v-icon icon="mdi-movie-open-plus-outline" size="40" /></span>
        <h3>{{ search ? 'Nenhum projeto encontrado' : 'Crie seu primeiro videoclipe' }}</h3>
        <p>
          {{ search ? 'Tente buscar usando outro nome.' : 'Envie uma música e acompanhe a criação do vídeo em uma experiência guiada.' }}
        </p>
        <button v-if="!search" class="app-button" type="button" @click="goToCreateProject">
          Começar agora
        </button>
      </div>
    </section>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';
import { formatProjectStatusLabel, projectStatusTone } from '@/utils/project-status';
import type { ProjectStatus, ProjectSummary } from '@/types/project.types';

@Component({
  components: {
    AppLayout
  }
})
export default class DashboardPage extends Vue {
  loading = false;
  search = '';

  get authStore(): any {
    return useAuthStore();
  }

  get projectsStore(): any {
    return useProjectsStore();
  }

  get projects(): ProjectSummary[] {
    return this.projectsStore.projects;
  }

  get filteredProjects(): ProjectSummary[] {
    const query = this.search.trim().toLocaleLowerCase('pt-BR');
    return query
      ? this.projects.filter((project) => project.title.toLocaleLowerCase('pt-BR').includes(query))
      : this.projects;
  }

  get activeProjectsCount(): number {
    return this.projects.filter((project) =>
      ['uploaded', 'queued', 'processing', 'analyzing', 'storyboarding', 'generating_scenes', 'rendering'].includes(project.status)
    ).length;
  }

  get completedProjectsCount(): number {
    return this.projects.filter((project) => project.status === 'completed').length;
  }

  get failedProjectsCount(): number {
    return this.projects.filter((project) => project.status === 'failed').length;
  }

  get errorMessage(): string | null {
    return this.projectsStore.errorMessage;
  }

  async mounted() {
    if (!this.authStore.token) return;
    this.loading = true;
    try {
      await this.projectsStore.fetchProjects(this.authStore.token);
    } finally {
      this.loading = false;
    }
  }

  goToCreateProject() {
    void this.$router.push({ name: 'create-project' });
  }

  openProject(project: ProjectSummary) {
    if (project.generationMode === 'children_clip') {
      void this.$router.push({
        name: 'children-clip-studio',
        params: { id: project.id },
        hash: '#step-4'
      });
      return;
    }
    const status = project.status;
    const routeName =
      status === 'completed'
        ? 'video-result'
        : ['uploaded', 'queued', 'processing', 'analyzing', 'storyboarding', 'generating_scenes', 'rendering'].includes(status)
          ? 'processing'
          : 'project-detail';
    void this.$router.push({ name: routeName, params: { id: project.id } });
  }

  openProjectLabel(project: ProjectSummary): string {
    if (project.generationMode === 'children_clip') return 'Abrir Etapa 4';
    const status = project.status;
    if (status === 'completed') return 'Ver videoclipe';
    if (status === 'failed') return 'Revisar problema';
    if (status === 'awaiting_references') return 'Revisar cenas';
    if (status === 'draft') return 'Continuar configuração';
    return 'Acompanhar geração';
  }

  statusLabel(status: ProjectStatus): string {
    return formatProjectStatusLabel(status);
  }

  statusTone(status: ProjectStatus) {
    return projectStatusTone(status);
  }

  statusIcon(status: ProjectStatus): string {
    if (status === 'completed') return 'mdi-play-circle-outline';
    if (status === 'failed') return 'mdi-alert-circle-outline';
    if (status === 'draft') return 'mdi-file-edit-outline';
    return 'mdi-auto-fix';
  }

  coverClass(status: ProjectStatus): string {
    if (status === 'completed') return 'project-cover--completed';
    if (status === 'failed') return 'project-cover--failed';
    if (status === 'draft') return 'project-cover--draft';
    return 'project-cover--active';
  }

  formatRelativeDate(value: string): string {
    const difference = Date.now() - new Date(value).getTime();
    const minutes = Math.floor(difference / 60_000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `há ${days} dia${days > 1 ? 's' : ''}`;
    return `em ${new Date(value).toLocaleDateString('pt-BR')}`;
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }
}
</script>

<style scoped>
.dashboard-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  min-height: 96px;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border: 1px solid #dfe3e8;
  border-radius: 14px;
  background: #fff;
}

.stat-card > span:last-child {
  display: flex;
  flex-direction: column;
}

.stat-card strong {
  font-size: 1.6rem;
  line-height: 1.1;
}

.stat-card small {
  margin-top: 4px;
  color: #65676b;
}

.stat-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 12px;
}

.stat-icon--blue { color: #0866ff; background: #e7f3ff; }
.stat-icon--amber { color: #a56800; background: #fff3d1; }
.stat-icon--green { color: #24853a; background: #e8f7eb; }
.stat-icon--red { color: #c91532; background: #fdecef; }

.projects-section {
  padding: 22px;
  border: 1px solid #dfe3e8;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 12px rgba(28, 30, 33, 0.06);
}

.projects-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.search-field {
  display: flex;
  width: min(320px, 100%);
  min-height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid #ccd0d5;
  border-radius: 9px;
  color: #65676b;
  background: #f7f8fa;
}

.search-field input {
  width: 100%;
  border: 0;
  outline: 0;
  color: #1c1e21;
  background: transparent;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.project-card-new {
  overflow: hidden;
  border: 1px solid #dfe3e8;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}

.project-card-new:hover {
  box-shadow: 0 8px 24px rgba(28, 30, 33, 0.12);
  transform: translateY(-2px);
}

.project-cover {
  position: relative;
  display: flex;
  height: 116px;
  align-items: center;
  justify-content: center;
}

.project-cover--completed { color: #fff; background: linear-gradient(135deg, #0866ff, #3c8dff); }
.project-cover--active { color: #744b00; background: linear-gradient(135deg, #fff3d1, #ffd97d); }
.project-cover--failed { color: #b2142f; background: linear-gradient(135deg, #fdecef, #fac3cc); }
.project-cover--draft { color: #4b4f56; background: linear-gradient(135deg, #f0f2f5, #dfe3e8); }

.project-duration {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 3px 7px;
  border-radius: 5px;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  font-size: 0.72rem;
  font-weight: 700;
}

.project-body {
  padding: 16px;
}

.project-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.project-title-row h4 {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-date,
.project-settings {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  color: #65676b;
  font-size: 0.78rem;
}

.project-settings span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.project-open-button {
  width: 100%;
  margin-top: 16px;
}

.project-skeleton {
  border: 1px solid #dfe3e8;
  border-radius: 14px;
}

.dashboard-empty {
  display: flex;
  min-height: 320px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.dashboard-empty__icon {
  display: inline-flex;
  width: 76px;
  height: 76px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #0866ff;
  background: #e7f3ff;
}

.dashboard-empty h3 {
  margin: 18px 0 6px;
}

.dashboard-empty p {
  max-width: 460px;
  margin: 0 0 18px;
  color: #65676b;
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .project-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 650px) {
  .dashboard-heading,
  .projects-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .dashboard-heading .app-button,
  .search-field {
    width: 100%;
  }

  .stats-grid { grid-template-columns: 1fr 1fr; }
  .stat-card { align-items: flex-start; flex-direction: column; }
  .project-grid { grid-template-columns: 1fr; }
  .projects-section { padding: 16px; }
}
</style>
