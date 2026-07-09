import { defineStore } from 'pinia';

import { projectsService } from '@/services/projects.service';
import type {
  ProjectRender,
  ProjectScene,
  ProjectStatusResponse,
  ProjectSummary
} from '@/types/project.types';

interface ProjectsState {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  currentStatus: ProjectStatusResponse | null;
  currentScenes: ProjectScene[];
  currentRender: ProjectRender | null;
  isLoading: boolean;
  errorMessage: string | null;
}

export const useProjectsStore = defineStore('projects', {
  state: (): ProjectsState => ({
    projects: [],
    currentProject: null,
    currentStatus: null,
    currentScenes: [],
    currentRender: null,
    isLoading: false,
    errorMessage: null
  }),
  actions: {
    resetProjectViewState() {
      this.currentStatus = null;
      this.currentScenes = [];
      this.currentRender = null;
    },
    clearProjectArtifacts() {
      this.currentScenes = [];
      this.currentRender = null;
    },
    async fetchProjects(token: string) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        this.projects = await projectsService.list(token);
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Falha ao carregar projetos';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async createProject(
      title: string,
      clipDurationSeconds: number | null,
      sceneDurationSeconds: number | null,
      visualCheckpointName: string | null,
      manualLyricsText: string | null,
      token: string
    ) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        const project = await projectsService.create(
          title,
          clipDurationSeconds,
          sceneDurationSeconds,
          visualCheckpointName,
          manualLyricsText,
          token
        );
        this.projects = [project, ...this.projects];
        this.currentProject = project;

        return project;
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Falha ao criar projeto';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async fetchProject(projectId: string, token: string) {
      this.isLoading = true;
      this.errorMessage = null;

      if (this.currentProject?.id !== projectId) {
        this.resetProjectViewState();
      }

      try {
        this.currentProject = await projectsService.detail(projectId, token);

        return this.currentProject;
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Falha ao carregar projeto';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async uploadTrack(
      projectId: string,
      file: File,
      clipDurationSeconds: number | null,
      sceneDurationSeconds: number | null,
      visualCheckpointName: string | null,
      manualLyricsText: string | null,
      token: string
    ) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        const result = await projectsService.upload(
          projectId,
          file,
          clipDurationSeconds,
          sceneDurationSeconds,
          visualCheckpointName,
          manualLyricsText,
          token
        );

        if (this.currentProject && this.currentProject.id === projectId) {
          this.currentProject = {
            ...this.currentProject,
            status: result.status,
            clipDurationSeconds,
            sceneDurationSeconds,
            visualCheckpointName,
            lyrics: manualLyricsText?.trim()
              ? {
                  source: 'manual',
                  rawText: manualLyricsText.trim(),
                  normalizedText: manualLyricsText.replace(/\s+/g, ' ').trim().toLowerCase()
                }
              : this.currentProject.lyrics,
            updatedAt: new Date().toISOString()
          };
        }

        this.projects = this.projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                status: result.status,
                clipDurationSeconds,
                sceneDurationSeconds,
                visualCheckpointName,
                updatedAt: new Date().toISOString()
              }
            : project
        );

        return result;
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Falha ao enviar MP3';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async retryProject(
      projectId: string,
      clipDurationSeconds: number | null,
      sceneDurationSeconds: number | null,
      visualCheckpointName: string | null,
      manualLyricsText: string | null,
      token: string
    ) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        const project = await projectsService.retry(
          projectId,
          clipDurationSeconds,
          sceneDurationSeconds,
          visualCheckpointName,
          manualLyricsText,
          token
        );
        this.currentProject = project;
        this.projects = this.projects.map((currentProject) =>
          currentProject.id === projectId ? project : currentProject
        );
        this.syncProjectStatus(projectId, project.status);
        this.currentStatus = null;
        return project;
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Falha ao reenfileirar projeto';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async fetchStatus(projectId: string, token: string) {
      this.currentStatus = await projectsService.status(projectId, token);
      this.syncProjectStatus(projectId, this.currentStatus.status);
      return this.currentStatus;
    },
    async fetchScenes(projectId: string, token: string) {
      this.currentScenes = await projectsService.scenes(projectId, token);
      return this.currentScenes;
    },
    async fetchRender(projectId: string, token: string) {
      this.currentRender = await projectsService.render(projectId, token);
      return this.currentRender;
    },
    async downloadRender(projectId: string, token: string) {
      return projectsService.download(projectId, token);
    },
    clearCurrentProject() {
      this.currentProject = null;
      this.resetProjectViewState();
      this.errorMessage = null;
    },
    syncProjectStatus(projectId: string, status: ProjectSummary['status']) {
      if (this.currentProject && this.currentProject.id === projectId) {
        this.currentProject = {
          ...this.currentProject,
          status,
          updatedAt: new Date().toISOString()
        };
      }

      this.projects = this.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              status,
              updatedAt: new Date().toISOString()
            }
          : project
      );
    }
  }
});
