import { apiService } from '@/services/api.service';
import type {
  CreateProjectInput,
  ProjectRender,
  ProjectScene,
  ProjectStatusResponse,
  ProjectSummary,
  ProjectVisualStoryboard,
  TrackUploadResult
} from '@/types/project.types';

class ProjectsService {
  list(token: string) {
    return apiService.request<ProjectSummary[]>('/projects', {}, token);
  }

  create(input: CreateProjectInput, token: string) {
    return apiService.request<ProjectSummary>(
      '/projects',
      {
        method: 'POST',
        body: JSON.stringify(input)
      },
      token
    );
  }

  uploadSourceImage(projectId: string, file: File, token: string) {
    const formData = new FormData();
    formData.append('file', file);

    return apiService.request<ProjectSummary>(
      `/projects/${projectId}/source-image`,
      {
        method: 'POST',
        body: formData
      },
      token
    );
  }

  detail(projectId: string, token: string) {
    return apiService.request<ProjectSummary>(`/projects/${projectId}`, {}, token);
  }

  upload(
    projectId: string,
    file: File,
    clipDurationSeconds: number | null,
    sceneDurationSeconds: number | null,
    visualCheckpointName: string | null,
    manualLyricsText: string | null,
    token: string
  ) {
    const formData = new FormData();
    formData.append('file', file);
    if (clipDurationSeconds !== null) {
      formData.append('clipDurationSeconds', String(clipDurationSeconds));
    }
    if (sceneDurationSeconds !== null) {
      formData.append('sceneDurationSeconds', String(sceneDurationSeconds));
    }
    if (visualCheckpointName && visualCheckpointName.trim()) {
      formData.append('visualCheckpointName', visualCheckpointName.trim());
    }
    if (manualLyricsText && manualLyricsText.trim()) {
      formData.append('manualLyricsText', manualLyricsText.trim());
    }

    return apiService.request<TrackUploadResult>(
      `/projects/${projectId}/upload-track`,
      {
        method: 'POST',
        body: formData
      },
      token
    );
  }

  retry(
    projectId: string,
    clipDurationSeconds: number | null,
    sceneDurationSeconds: number | null,
    visualCheckpointName: string | null,
    manualLyricsText: string | null,
    token: string
  ) {
    return apiService.request<ProjectSummary>(
      `/projects/${projectId}/retry`,
      {
        method: 'POST',
        body: JSON.stringify({
          clipDurationSeconds,
          sceneDurationSeconds,
          visualCheckpointName,
          manualLyricsText
        })
      },
      token
    );
  }

  status(projectId: string, token: string) {
    return apiService.request<ProjectStatusResponse>(`/projects/${projectId}/status`, {}, token);
  }

  scenes(projectId: string, token: string) {
    return apiService.request<ProjectScene[]>(`/projects/${projectId}/scenes`, {}, token);
  }

  visualStoryboard(projectId: string, token: string) {
    return apiService.request<ProjectVisualStoryboard>(
      `/projects/${projectId}/visual-storyboard`,
      {},
      token
    );
  }

  regenerateVisualStoryboard(projectId: string, instruction: string, token: string) {
    return apiService.request<ProjectVisualStoryboard>(
      `/projects/${projectId}/visual-storyboard/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ instruction })
      },
      token
    );
  }

  downloadVisualStoryboardImage(projectId: string, token: string) {
    return apiService.download(`/projects/${projectId}/visual-storyboard/image`, token);
  }

  uploadSceneReferenceImage(projectId: string, sceneId: string, file: File, token: string) {
    const formData = new FormData();
    formData.append('file', file);

    return apiService.request<ProjectScene>(
      `/projects/${projectId}/scenes/${sceneId}/reference-image`,
      {
        method: 'POST',
        body: formData
      },
      token
    );
  }

  retrySceneRender(projectId: string, sceneId: string, token: string) {
    return apiService.request<ProjectScene>(
      `/projects/${projectId}/scenes/${sceneId}/retry-render`,
      {
        method: 'POST'
      },
      token
    );
  }

  startRender(projectId: string, token: string) {
    return apiService.request<ProjectSummary>(
      `/projects/${projectId}/start-render`,
      {
        method: 'POST'
      },
      token
    );
  }

  render(projectId: string, token: string) {
    return apiService.request<ProjectRender>(`/projects/${projectId}/render`, {}, token);
  }

  download(projectId: string, token: string) {
    return apiService.download(`/projects/${projectId}/download`, token);
  }
}

export const projectsService = new ProjectsService();
