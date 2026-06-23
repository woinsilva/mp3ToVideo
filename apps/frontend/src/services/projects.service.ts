import { apiService } from '@/services/api.service';
import type {
  ProjectRender,
  ProjectScene,
  ProjectStatusResponse,
  ProjectSummary,
  TrackUploadResult
} from '@/types/project.types';

class ProjectsService {
  list(token: string) {
    return apiService.request<ProjectSummary[]>('/projects', {}, token);
  }

  create(title: string, clipDurationSeconds: number | null, token: string) {
    return apiService.request<ProjectSummary>(
      '/projects',
      {
        method: 'POST',
        body: JSON.stringify({
          title,
          clipDurationSeconds
        })
      },
      token
    );
  }

  detail(projectId: string, token: string) {
    return apiService.request<ProjectSummary>(`/projects/${projectId}`, {}, token);
  }

  upload(projectId: string, file: File, token: string) {
    const formData = new FormData();
    formData.append('file', file);

    return apiService.request<TrackUploadResult>(
      `/projects/${projectId}/upload-track`,
      {
        method: 'POST',
        body: formData
      },
      token
    );
  }

  retry(projectId: string, clipDurationSeconds: number | null, token: string) {
    return apiService.request<ProjectSummary>(
      `/projects/${projectId}/retry`,
      {
        method: 'POST',
        body: JSON.stringify({
          clipDurationSeconds
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

  render(projectId: string, token: string) {
    return apiService.request<ProjectRender>(`/projects/${projectId}/render`, {}, token);
  }

  download(projectId: string, token: string) {
    return apiService.download(`/projects/${projectId}/download`, token);
  }
}

export const projectsService = new ProjectsService();
