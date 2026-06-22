export type ProjectStatus =
  | 'draft'
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'analyzing'
  | 'storyboarding'
  | 'generating_scenes'
  | 'rendering'
  | 'completed'
  | 'failed';

export interface ProjectSummary {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TrackUploadResult {
  projectId: string;
  trackId: string;
  status: ProjectStatus;
}

export interface ProjectStatusResponse {
  projectId: string;
  status: ProjectStatus;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  lastUpdatedAt: string;
  isPossiblyStalled: boolean;
}

export interface ScenePromptView {
  provider: string;
  positivePrompt: string;
  negativePrompt: string;
  style: string;
  camera: string;
}

export interface ProjectScene {
  id: string;
  index: number;
  title: string;
  description: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  status: string;
  videoAssetId: string | null;
  prompt: ScenePromptView | null;
}

export interface RenderAssetView {
  id: string;
  mimeType: string;
  storagePath: string;
  sizeBytes: number;
}

export interface ProjectRender {
  id: string;
  status: string;
  durationSeconds: number | null;
  asset: RenderAssetView | null;
}
