import { defineStore } from 'pinia';

import { projectsService } from '@/services/projects.service';
import type {
  CreateProjectInput,
  ProjectRender,
  ProjectScene,
  ProjectStatusResponse,
  ProjectSummary,
  ProjectVisualStoryboard
} from '@/types/project.types';

interface ProjectsState {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  currentStatus: ProjectStatusResponse | null;
  currentScenes: ProjectScene[];
  currentVisualStoryboard: ProjectVisualStoryboard | null;
  currentVisualStoryboardImageUrl: string | null;
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
    currentVisualStoryboard: null,
    currentVisualStoryboardImageUrl: null,
    currentRender: null,
    isLoading: false,
    errorMessage: null
  }),
  actions: {
    resetProjectViewState() {
      this.currentStatus = null;
      this.currentScenes = [];
      this.revokeVisualStoryboardImageUrl();
      this.currentVisualStoryboard = null;
      this.currentRender = null;
    },
    clearProjectArtifacts() {
      this.currentScenes = [];
      this.revokeVisualStoryboardImageUrl();
      this.currentVisualStoryboard = null;
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
    async createProject(input: CreateProjectInput, token: string) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        const project = await projectsService.create(input, token);
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
    async fetchVisualStoryboard(projectId: string, token: string) {
      this.currentVisualStoryboard = await projectsService.visualStoryboard(projectId, token);

      if (this.currentVisualStoryboard.hasImage) {
        await this.fetchVisualStoryboardImage(projectId, token);
      } else {
        this.revokeVisualStoryboardImageUrl();
      }

      return this.currentVisualStoryboard;
    },
    async fetchVisualStoryboardImage(projectId: string, token: string) {
      const blob = await projectsService.downloadVisualStoryboardImage(projectId, token);
      this.revokeVisualStoryboardImageUrl();
      this.currentVisualStoryboardImageUrl = URL.createObjectURL(blob);
      return this.currentVisualStoryboardImageUrl;
    },
    async regenerateVisualStoryboard(projectId: string, instruction: string, token: string) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        this.currentVisualStoryboard = await projectsService.regenerateVisualStoryboard(
          projectId,
          instruction,
          token
        );
        await this.fetchVisualStoryboardImage(projectId, token);
        return this.currentVisualStoryboard;
      } catch (error) {
        this.errorMessage =
          error instanceof Error ? error.message : 'Falha ao regerar storyboard visual';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async uploadSceneReferenceImage(
      projectId: string,
      sceneId: string,
      file: File,
      token: string
    ) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        const updatedScene = await projectsService.uploadSceneReferenceImage(
          projectId,
          sceneId,
          file,
          token
        );

        this.currentScenes = this.currentScenes.map((scene) =>
          scene.id === sceneId ? updatedScene : scene
        );

        return updatedScene;
      } catch (error) {
        this.errorMessage =
          error instanceof Error ? error.message : 'Falha ao enviar imagem de referencia';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async retrySceneRender(projectId: string, sceneId: string, token: string) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        const updatedScene = await projectsService.retrySceneRender(projectId, sceneId, token);

        this.currentScenes = this.currentScenes.map((scene) =>
          scene.id === sceneId ? updatedScene : scene
        );

        return updatedScene;
      } catch (error) {
        this.errorMessage =
          error instanceof Error ? error.message : 'Falha ao reiniciar render da cena';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async startRender(projectId: string, token: string) {
      this.isLoading = true;
      this.errorMessage = null;

      try {
        const project = await projectsService.startRender(projectId, token);
        this.currentProject = project;
        this.projects = this.projects.map((currentProject) =>
          currentProject.id === projectId ? project : currentProject
        );
        this.syncProjectStatus(projectId, project.status);
        this.currentStatus = null;
        return project;
      } catch (error) {
        this.errorMessage =
          error instanceof Error ? error.message : 'Falha ao iniciar renderizacao';
        throw error;
      } finally {
        this.isLoading = false;
      }
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
    revokeVisualStoryboardImageUrl() {
      if (this.currentVisualStoryboardImageUrl) {
        URL.revokeObjectURL(this.currentVisualStoryboardImageUrl);
        this.currentVisualStoryboardImageUrl = null;
      }
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
