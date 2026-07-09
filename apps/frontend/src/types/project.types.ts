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
  clipDurationSeconds: number | null;
  sceneDurationSeconds: number | null;
  visualCheckpointName: string | null;
  status: ProjectStatus;
  lyrics: ProjectLyricsStatus | null;
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
  detailMessage: string | null;
  activityLog: ProjectStatusActivityEntry[];
  lyrics: ProjectLyricsStatus | null;
  musicSections: ProjectMusicSectionStatus[];
  errorMessage: string | null;
  lastUpdatedAt: string;
  isPossiblyStalled: boolean;
}

export interface ProjectStatusActivityEntry {
  stage: string;
  message: string;
  provider: string | null;
  progress: number | null;
  timestamp: string;
}

export interface ProjectLyricsStatus {
  source: string;
  rawText: string;
  normalizedText: string;
}

export interface ProjectMusicSectionStatus {
  type: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  lyricsExcerpt: string | null;
  energy: number | null;
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
  visualProvider: string | null;
  videoAssetId: string | null;
  referenceImageAssetId: string | null;
  hasReferenceImage: boolean;
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
