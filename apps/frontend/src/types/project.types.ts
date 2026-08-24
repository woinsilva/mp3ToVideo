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
  generationMode: 'music' | 'prompt' | 'image' | 'children_clip';
  generationPrompt: string | null;
  stabilityTest: boolean;
  wanOnly: boolean;
  generationSeed: number | null;
  generationCfg: number | null;
  generationSteps: number | null;
  generationFps: number;
  frameInterpolationMode: 'off' | 'rife_2x';
  sourceImageAssetId: string | null;
  hasSourceImage: boolean;
  sourceImage: {
    id: string;
    mimeType: string;
    width: number | null;
    height: number | null;
  } | null;
  clipDurationSeconds: number | null;
  sceneDurationSeconds: number | null;
  visualCheckpointName: string | null;
  status: ProjectStatus;
  lyrics: ProjectLyricsStatus | null;
  childrenClip: ChildrenClipConfiguration | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  title: string;
  generationMode: 'music' | 'prompt' | 'image' | 'children_clip';
  generationPrompt: string | null;
  stabilityTest: boolean;
  wanOnly: boolean;
  generationSeed: number | null;
  generationCfg: number | null;
  generationSteps: number | null;
  generationFps: 16 | 24;
  frameInterpolationMode: 'off' | 'rife_2x';
  clipDurationSeconds: number | null;
  sceneDurationSeconds: number | null;
  visualCheckpointName: string | null;
  manualLyricsText: string | null;
  childrenClipConcept?: string | null;
  childrenClipVisualStyle?: string | null;
  audienceAgeMin?: number | null;
  audienceAgeMax?: number | null;
  childrenClipAspectRatio?: ChildrenClipAspectRatio | null;
}

export type ChildrenClipAspectRatio = 'landscape_16_9' | 'portrait_9_16' | 'square_1_1';

export interface ChildrenClipConfiguration {
  id: string;
  concept: string;
  audienceAgeMin: number;
  audienceAgeMax: number;
  aspectRatio: ChildrenClipAspectRatio;
  visualStyle: string;
  productionStatus: string;
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
  provider: string;
  sourceType: string;
  hasReferenceImage: boolean;
  referenceImageAssetId: string | null;
  workflowName: string | null;
  positivePrompt: string | null;
  negativePrompt: string | null;
  seed: number | null;
  cfg: number | null;
  steps: number | null;
  sampler: string | null;
  scheduler: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  requestedFps: number | null;
  effectiveFps: number | null;
  requestedFrameCount: number | null;
  calculatedFrameCount: number | null;
  effectiveFrameCount: number | null;
  frameCount: number | null;
  requestedDurationSeconds: number | null;
  effectiveDurationSeconds: number | null;
  calculatedDurationSeconds: number | null;
  videoValidationStatus: string | null;
  videoValidationWarnings: string[];
  unetName: string | null;
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

export interface FrameInterpolationStatus {
  job: {
    id: string;
    status: 'queued' | 'active' | 'completed' | 'failed' | 'retrying';
    progress: number;
    detailMessage: string | null;
    errorMessage: string | null;
    updatedAt: string;
  } | null;
  asset: (RenderAssetView & { metadata: Record<string, unknown> | null }) | null;
}
