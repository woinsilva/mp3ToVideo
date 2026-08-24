import { apiService } from '@/services/api.service';
import type {
  CharacterAssetRole,
  ChildrenClipCharacter,
  ChildrenClipCharacterVersion,
  ChildrenClipAudioStatus,
  ChildrenClipPlanStatus,
  ChildrenClipProductionAssetsStatus,
  ChildrenClipAnimationStatus,
  ChildrenClipOutputStatus,
  ChildrenClipShotAssetRole,
  ChildrenClipShot,
  CreateChildrenClipCharacterInput,
  CreateProjectInput,
  FrameInterpolationStatus,
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

  interpolation(projectId: string, token: string) {
    return apiService.request<FrameInterpolationStatus>(`/projects/${projectId}/interpolation`, {}, token);
  }

  requestInterpolation(projectId: string, token: string) {
    return apiService.request(`/projects/${projectId}/interpolation`, { method: 'POST' }, token);
  }

  downloadInterpolation(projectId: string, token: string) {
    return apiService.download(`/projects/${projectId}/interpolation/download`, token);
  }

  listChildrenClipCharacters(projectId: string, token: string) {
    return apiService.request<ChildrenClipCharacter[]>(`/projects/${projectId}/children-clip/characters`, {}, token);
  }

  createChildrenClipCharacter(projectId: string, input: CreateChildrenClipCharacterInput, token: string) {
    return apiService.request<ChildrenClipCharacter>(`/projects/${projectId}/children-clip/characters`, {
      method: 'POST', body: JSON.stringify(input)
    }, token);
  }

  createChildrenClipCharacterVersion(
    projectId: string,
    characterId: string,
    input: { description: string; origin: 'generated' | 'uploaded' | 'hybrid'; invariants: string[] },
    token: string
  ) {
    return apiService.request<ChildrenClipCharacterVersion>(`/projects/${projectId}/children-clip/characters/${characterId}/versions`, {
      method: 'POST', body: JSON.stringify(input)
    }, token);
  }

  uploadChildrenClipCharacterAsset(
    projectId: string,
    characterId: string,
    versionId: string,
    file: File,
    role: CharacterAssetRole,
    label: string,
    token: string
  ) {
    const form = new FormData();
    form.append('file', file);
    form.append('role', role);
    if (label.trim()) form.append('label', label.trim());
    return apiService.request<ChildrenClipCharacterVersion>(`/projects/${projectId}/children-clip/characters/${characterId}/versions/${versionId}/assets`, {
      method: 'POST', body: form
    }, token);
  }

  approveChildrenClipCharacterVersion(projectId: string, characterId: string, versionId: string, token: string) {
    return apiService.request<ChildrenClipCharacterVersion>(`/projects/${projectId}/children-clip/characters/${characterId}/versions/${versionId}/approve`, { method: 'POST' }, token);
  }

  retryChildrenClipCharacterGeneration(projectId: string, characterId: string, versionId: string, token: string) {
    return apiService.request<ChildrenClipCharacterVersion>(`/projects/${projectId}/children-clip/characters/${characterId}/versions/${versionId}/generate`, { method: 'POST' }, token);
  }

  downloadChildrenClipCharacterAsset(projectId: string, characterId: string, versionId: string, assetId: string, token: string) {
    return apiService.download(`/projects/${projectId}/children-clip/characters/${characterId}/versions/${versionId}/assets/${assetId}`, token);
  }

  getChildrenClipAudioAnalysis(projectId: string, token: string) {
    return apiService.request<ChildrenClipAudioStatus>(`/projects/${projectId}/children-clip/audio-analysis`, {}, token);
  }

  retryChildrenClipAudioAnalysis(projectId: string, token: string) {
    return apiService.request<ChildrenClipAudioStatus>(`/projects/${projectId}/children-clip/audio-analysis`, { method: 'POST' }, token);
  }

  getChildrenClipProductionPlan(projectId: string, token: string) {
    return apiService.request<ChildrenClipPlanStatus>(`/projects/${projectId}/children-clip/production-plan`, {}, token);
  }

  generateChildrenClipProductionPlan(projectId: string, revisionInstruction: string | null, token: string) {
    return apiService.request<ChildrenClipPlanStatus>(`/projects/${projectId}/children-clip/production-plan/generate`, {
      method: 'POST', body: JSON.stringify({ revisionInstruction })
    }, token);
  }

  updateChildrenClipProductionPlan(projectId: string, input: { visualBible: Record<string, unknown>; narrative: Record<string, unknown> }, token: string) {
    return apiService.request<ChildrenClipPlanStatus>(`/projects/${projectId}/children-clip/production-plan`, {
      method: 'PUT', body: JSON.stringify(input)
    }, token);
  }

  updateChildrenClipShot(projectId: string, shotId: string, input: Partial<ChildrenClipShot>, token: string) {
    return apiService.request<ChildrenClipPlanStatus>(`/projects/${projectId}/children-clip/production-plan/shots/${shotId}`, {
      method: 'PATCH', body: JSON.stringify(input)
    }, token);
  }

  approveChildrenClipProductionPlan(projectId: string, token: string) {
    return apiService.request<ChildrenClipPlanStatus>(`/projects/${projectId}/children-clip/production-plan/approve`, { method: 'POST' }, token);
  }

  getChildrenClipProductionAssets(projectId: string, token: string) {
    return apiService.request<ChildrenClipProductionAssetsStatus>(`/projects/${projectId}/children-clip/production-assets`, {}, token);
  }

  generateMissingChildrenClipBackgrounds(projectId: string, token: string) {
    return apiService.request<ChildrenClipProductionAssetsStatus>(`/projects/${projectId}/children-clip/production-assets/generate-missing-backgrounds`, { method: 'POST' }, token);
  }

  generateChildrenClipShotAsset(projectId: string, shotId: string, role: Exclude<ChildrenClipShotAssetRole, 'character_pose'>, prompt: string | null, token: string) {
    return apiService.request<ChildrenClipProductionAssetsStatus>(`/projects/${projectId}/children-clip/production-assets/shots/${shotId}/generate`, {
      method: 'POST', body: JSON.stringify({ role, prompt: prompt?.trim() || undefined })
    }, token);
  }

  uploadChildrenClipShotAsset(projectId: string, shotId: string, file: File, role: ChildrenClipShotAssetRole, token: string) {
    const form = new FormData();
    form.append('file', file); form.append('role', role);
    return apiService.request<ChildrenClipProductionAssetsStatus>(`/projects/${projectId}/children-clip/production-assets/shots/${shotId}/upload`, { method: 'POST', body: form }, token);
  }

  approveChildrenClipShotAsset(projectId: string, shotAssetId: string, token: string) {
    return apiService.request<ChildrenClipProductionAssetsStatus>(`/projects/${projectId}/children-clip/production-assets/${shotAssetId}/approve`, { method: 'POST' }, token);
  }

  retryChildrenClipShotAsset(projectId: string, shotAssetId: string, token: string) {
    return apiService.request<ChildrenClipProductionAssetsStatus>(`/projects/${projectId}/children-clip/production-assets/${shotAssetId}/retry`, { method: 'POST' }, token);
  }

  downloadChildrenClipShotAsset(projectId: string, shotAssetId: string, token: string) {
    return apiService.download(`/projects/${projectId}/children-clip/production-assets/${shotAssetId}/file`, token);
  }

  getChildrenClipAnimation(projectId: string, token: string) {
    return apiService.request<ChildrenClipAnimationStatus>(`/projects/${projectId}/children-clip/animation`, {}, token);
  }

  renderMissingChildrenClipShots(projectId: string, token: string) {
    return apiService.request<ChildrenClipAnimationStatus>(`/projects/${projectId}/children-clip/animation/render-missing`, { method: 'POST' }, token);
  }

  renderChildrenClipShot(projectId: string, shotId: string, token: string) {
    return apiService.request<ChildrenClipAnimationStatus>(`/projects/${projectId}/children-clip/animation/shots/${shotId}/render`, { method: 'POST' }, token);
  }

  retryChildrenClipShotRender(projectId: string, attemptId: string, token: string) {
    return apiService.request<ChildrenClipAnimationStatus>(`/projects/${projectId}/children-clip/animation/attempts/${attemptId}/retry`, { method: 'POST' }, token);
  }

  downloadChildrenClipShotRender(projectId: string, attemptId: string, token: string) {
    return apiService.download(`/projects/${projectId}/children-clip/animation/attempts/${attemptId}/file`, token);
  }

  getChildrenClipOutput(projectId: string, token: string) {
    return apiService.request<ChildrenClipOutputStatus>(`/projects/${projectId}/children-clip/output`, {}, token);
  }

  generateChildrenClipHeroShot(projectId: string, shotId: string, token: string) {
    return apiService.request<ChildrenClipOutputStatus>(`/projects/${projectId}/children-clip/output/shots/${shotId}/wan`, { method: 'POST' }, token);
  }

  retryChildrenClipHeroShot(projectId: string, attemptId: string, token: string) {
    return apiService.request<ChildrenClipOutputStatus>(`/projects/${projectId}/children-clip/output/hero-attempts/${attemptId}/retry`, { method: 'POST' }, token);
  }

  approveChildrenClipHeroShot(projectId: string, attemptId: string, token: string) {
    return apiService.request<ChildrenClipOutputStatus>(`/projects/${projectId}/children-clip/output/hero-attempts/${attemptId}/approve`, { method: 'POST' }, token);
  }

  renderChildrenClipFinal(projectId: string, token: string) {
    return apiService.request<ChildrenClipOutputStatus>(`/projects/${projectId}/children-clip/output/final`, { method: 'POST' }, token);
  }

  retryChildrenClipFinal(projectId: string, finalRenderId: string, token: string) {
    return apiService.request<ChildrenClipOutputStatus>(`/projects/${projectId}/children-clip/output/final/${finalRenderId}/retry`, { method: 'POST' }, token);
  }

  downloadChildrenClipHeroShot(projectId: string, attemptId: string, token: string) {
    return apiService.download(`/projects/${projectId}/children-clip/output/hero-attempts/${attemptId}/file`, token);
  }

  downloadChildrenClipFinal(projectId: string, finalRenderId: string, token: string) {
    return apiService.download(`/projects/${projectId}/children-clip/output/final/${finalRenderId}/file`, token);
  }
}

export const projectsService = new ProjectsService();
