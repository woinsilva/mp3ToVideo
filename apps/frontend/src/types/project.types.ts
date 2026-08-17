export type ProjectStatus =
  | 'draft'
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'analyzing'
  | 'storyboarding'
  | 'generating_scenes'
  | 'awaiting_references'
  | 'rendering'
  | 'completed'
  | 'failed';

export interface ProjectSummary {
  id: string;
  title: string;
  generationMode: 'music' | 'prompt';
  generationPrompt: string | null;
  clipDurationSeconds: number | null;
  sceneDurationSeconds: number | null;
  visualCheckpointName: string | null;
  status: ProjectStatus;
  lyrics: ProjectLyricsStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  title: string;
  generationMode: 'music' | 'prompt';
  generationPrompt: string | null;
  clipDurationSeconds: number | null;
  sceneDurationSeconds: number | null;
  visualCheckpointName: string | null;
  manualLyricsText: string | null;
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
  renderRuntime: ProjectRenderRuntime | null;
  isPossiblyStalled: boolean;
}

export interface ProjectRenderRuntime {
  totalElapsedSeconds: number | null;
  currentStageElapsedSeconds: number | null;
  currentSceneElapsedSeconds: number | null;
  lastServerHeartbeatAt: string | null;
  lastExternalHeartbeatAt: string | null;
  health: 'normal' | 'long_running' | 'suspected_stuck';
  activeScene: ProjectActiveRenderScene | null;
}

export interface ProjectActiveRenderScene {
  sceneId: string;
  index: number;
  title: string;
  attemptNumber: number;
  provider: string;
  promptId: string | null;
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
  attemptSummary: SceneRenderAttemptSummary | null;
  prompt: ScenePromptView | null;
}

export interface ProjectVisualStoryboard {
  concept: string;
  visualStyle: string;
  mood: string;
  colorPalette: string;
  narrativeSummary: string;
  visualPrompt: string | null;
  revisionInstruction: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  updatedAt: string;
}

export interface SceneRenderAttemptSummary {
  activeAttemptId: string | null;
  latestAttemptStatus: string | null;
  attemptNumber: number | null;
  elapsedSeconds: number | null;
  lastHeartbeatAt: string | null;
  lastExternalHeartbeatAt: string | null;
  canRetryAttempt: boolean;
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
