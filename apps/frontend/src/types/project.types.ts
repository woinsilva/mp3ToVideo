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

export type CharacterAssetRole =
  | 'primary_reference'
  | 'front_view'
  | 'side_view'
  | 'back_view'
  | 'portrait'
  | 'expression'
  | 'pose'
  | 'mouth_shape'
  | 'eye_state'
  | 'source_reference';

export interface ChildrenClipCharacterAsset {
  id: string;
  assetId: string | null;
  role: CharacterAssetRole;
  origin: 'generated' | 'uploaded';
  status: 'draft' | 'queued' | 'generating' | 'ready_for_review' | 'approved' | 'rejected' | 'failed';
  label: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  errorMessage: string | null;
  bullJobId: string | null;
  generationMetadata: Record<string, unknown> | null;
}

export interface ChildrenClipCharacterVersion {
  id: string;
  versionNumber: number;
  origin: 'generated' | 'uploaded' | 'hybrid';
  status: 'draft' | 'queued' | 'generating' | 'ready_for_review' | 'approved' | 'rejected' | 'failed';
  description: string;
  generationPrompt: string | null;
  seed: number | null;
  bullJobId: string | null;
  errorMessage: string | null;
  invariants: string[];
  generationMetadata: Record<string, unknown> | null;
  generationStartedAt: string | null;
  generationCompletedAt: string | null;
  assets: ChildrenClipCharacterAsset[];
}

export interface ChildrenClipCharacter {
  id: string;
  name: string;
  description: string;
  scope: 'project' | 'organization';
  roleName: string | null;
  approvedVersionId: string | null;
  selectedVersionId: string | null;
  versions: ChildrenClipCharacterVersion[];
}

export interface ChildrenClipLibraryCharacter {
  id: string;
  name: string;
  description: string;
  approvedVersionId: string;
  versionNumber: number;
  previewAssetId: string | null;
}

export interface CreateChildrenClipCharacterInput {
  name: string;
  description: string;
  sourceMode: 'generated' | 'uploaded';
  scope: 'project' | 'organization';
  roleName?: string | null;
  invariants: string[];
}

export interface ChildrenClipAudioAnalysis {
  id: string;
  status: 'queued' | 'analyzing' | 'completed' | 'failed';
  bullJobId: string | null;
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  bpm: number | null;
  beatConfidence: number | null;
  timeSignature: number;
  loudnessDb: number | null;
  peakDb: number | null;
  beatGrid: number[] | null;
  energyCurve: Array<{ time: number; energy: number }> | null;
  waveform: Array<{ time: number; min: number; max: number }> | null;
  errorMessage: string | null;
  analysisStartedAt: string | null;
  analysisCompletedAt: string | null;
}

export interface ChildrenClipLyricCue {
  id: string;
  lineIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  confidence: number;
  words: Array<{ text: string; startSeconds: number; endSeconds: number }> | null;
}

export interface ChildrenClipMusicSection {
  id: string;
  type: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  lyricsExcerpt: string | null;
  energy: number | null;
}

export interface ChildrenClipAudioStatus {
  analysis: ChildrenClipAudioAnalysis | null;
  lyricCues: ChildrenClipLyricCue[];
  musicSections: ChildrenClipMusicSection[];
  job: {
    id: string;
    status: 'queued' | 'active' | 'completed' | 'failed' | 'retrying';
    progress: number;
    detailMessage: string | null;
    errorMessage: string | null;
    activityLog: Array<{ stage: string; message: string; progress: number; timestamp: string }> | null;
  } | null;
}

export interface ChildrenClipProductionPlan {
  id: string;
  versionNumber: number;
  status: 'draft' | 'queued' | 'generating' | 'ready_for_review' | 'approved' | 'rejected' | 'failed';
  bullJobId: string | null;
  visualBible: Record<string, unknown> | null;
  narrative: Record<string, unknown> | null;
  generationMetadata: Record<string, unknown> | null;
  revisionInstruction: string | null;
  errorMessage: string | null;
  approvedAt: string | null;
}

export interface ChildrenClipShot {
  id: string;
  musicSectionId: string | null;
  index: number;
  title: string;
  description: string;
  purpose: string;
  primaryFocus: string | null;
  timeOfDay: string | null;
  emotion: string | null;
  motionIntent: string | null;
  continuityFromPreviousShot: string | null;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  status: 'draft' | 'approved' | 'needs_revision';
  renderMode: 'animation_2d' | 'wan' | 'hybrid' | 'snapgen';
  framing: string;
  cameraMovement: string;
  characterAction: string;
  environment: string;
  backgroundPrompt: string;
  transitionIn: string | null;
  transitionOut: string | null;
  lyricText: string | null;
  characterVersionIds: string[] | null;
  forbiddenEntityVersionIds: string[] | null;
  objects: string[] | null;
  characterPlacement: Record<string, unknown> | null;
  backgroundSafeZones: Array<Record<string, unknown>> | null;
  groundingRules: Record<string, unknown> | null;
  location: { id: string; key: string; name: string; description: string; timeOfDay: string | null; visualPrompt: string; masterBackgroundAssetId: string | null } | null;
  musicSection: { id: string; title: string; type: string } | null;
  layers: Array<Record<string, unknown>> | null;
  motionPreset: string | null;
  revisionInstruction: string | null;
}

export interface ChildrenClipPlanStatus {
  plan: ChildrenClipProductionPlan | null;
  shots: ChildrenClipShot[];
  readyToGenerate: boolean;
  blockers: string[];
  job: {
    status: 'queued' | 'active' | 'completed' | 'failed' | 'retrying';
    progress: number;
    detailMessage: string | null;
    errorMessage: string | null;
    activityLog: Array<{ stage: string; message: string; progress: number; timestamp: string }> | null;
  } | null;
}

export type ChildrenClipShotAssetRole = 'background' | 'foreground' | 'prop' | 'character_pose' | 'storyboard_frame';

export interface ChildrenClipShotAsset {
  id: string;
  role: ChildrenClipShotAssetRole;
  origin: 'generated' | 'uploaded';
  status: 'draft' | 'queued' | 'generating' | 'ready_for_review' | 'approved' | 'rejected' | 'failed';
  versionNumber: number;
  label: string | null;
  characterVersionId: string | null;
  generationPrompt: string | null;
  seed: number | null;
  errorMessage: string | null;
  reviewReason: string | null;
  styleCompatible: boolean;
  asset: { id: string; mimeType: string; width: number | null; height: number | null; sizeBytes: number } | null;
  job: { status: 'queued' | 'active' | 'completed' | 'failed' | 'retrying'; progress: number; detailMessage: string | null; errorMessage: string | null; activityLog: Array<{ stage: string; message: string; progress: number; timestamp: string }> | null } | null;
}

export interface ChildrenClipProductionAssetsStatus {
  styleLock: {
    versionNumber: number;
    status: 'locked' | 'stale';
    profile: { medium?: string; palette?: string[]; maxBackgroundDetail?: string; characterDetail?: { level?: string } };
    styleReferenceAssetIds: string[];
    staleReason: string | null;
    lockedAt: string;
  } | null;
  locations: ChildrenClipProductionLocation[];
  shots: Array<ChildrenClipShot & { assets: ChildrenClipShotAsset[] }>;
  summary: { totalShots: number; approvedBackgrounds: number; approvedStoryboards: number; requiredStoryboards: number; readyForAnimation: boolean };
}

export interface ChildrenClipProductionLocation {
  id: string;
  key: string;
  name: string;
  description: string;
  anchorShotId: string;
  phase: 'needs_master' | 'master_generating' | 'master_in_review' | 'ready_for_variants' | 'variants_in_review' | 'complete';
  approvedShots: number;
  master: { shotAssetId: string; assetId: string; shotId: string; versionNumber: number; status: 'approved'; approvedAt: string } | null;
  shots: Array<{ id: string; index: number; title: string; description: string; framing: string; cameraMovement: string; hasUsableBackground: boolean; hasApprovedBackground: boolean; approvedBackgroundVersion: number | null }>;
}

export interface ChildrenClipShotRenderAttempt {
  id: string;
  attemptNumber: number;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  renderManifest: Record<string, unknown> | null;
  hasVideo: boolean;
  createdAt: string;
  renderStartedAt: string | null;
  renderCompletedAt: string | null;
}

export interface ChildrenClipAnimationStatus {
  shots: Array<{
    id: string;
    index: number;
    title: string;
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
    renderMode: 'animation_2d' | 'wan' | 'hybrid' | 'snapgen';
    hasApprovedBackground: boolean;
    hasApprovedStoryboard: boolean;
    latestAttempt: ChildrenClipShotRenderAttempt | null;
  }>;
  summary: { total2dShots: number; completed2dShots: number };
}

export interface ChildrenClipHeroShotAttempt {
  id: string;
  attemptNumber: number;
  status: 'queued' | 'generating' | 'validating' | 'ready_for_review' | 'approved' | 'rejected' | 'failed';
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  generationManifest: Record<string, unknown> | null;
  assetId: string | null;
  provider: 'comfyui-video' | 'snapgen';
  requestMetadata: ChildrenClipVideoGenerationRequest | null;
  externalJobId: string | null;
  submittedAt: string | null;
  lastHeartbeatAt: string | null;
  durationMs: number | null;
}

export interface ChildrenClipVideoGenerationRequest {
  provider: 'local' | 'snapgen';
  model?: 'veo-3.1-fast';
  resolution?: '720p' | '1080p';
  referenceMode?: 'frame' | 'ingredient';
  prompt?: string;
  firstImageAssetId?: string | null;
  lastImageAssetId?: string | null;
  ingredientAssetIds?: string[];
}

export interface ChildrenClipVideoReference {
  id: string;
  name: string;
  type: string;
  origin: string;
  version: number;
  shotId?: string;
  characterName?: string;
  mimeType: string;
}

export interface ChildrenClipOutputStatus {
  heroShots: Array<{ id: string; index: number; title: string; durationSeconds: number; renderMode: 'wan' | 'hybrid' | 'snapgen'; videoGenerationConfig: ChildrenClipVideoGenerationRequest | null; automaticPrompt: string; approvedStoryboardAssetId: string | null; latestAttempt: ChildrenClipHeroShotAttempt | null }>;
  availableReferences: ChildrenClipVideoReference[];
  snapgen: { configured: boolean; models: Record<string, { label: string; durations: readonly number[]; resolutions: readonly string[]; aspectRatios: readonly string[]; referenceModes: readonly string[]; maxIngredientImages: number }> };
  finalRender: null | {
    id: string; versionNumber: number; status: 'queued' | 'compositing' | 'encoding' | 'validating' | 'completed' | 'failed';
    progress: number; stage: string | null; errorMessage: string | null; renderManifest: Record<string, unknown> | null; hasVideo: boolean;
  };
  readyForFinal: boolean;
  blockers: string[];
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
