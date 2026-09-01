import { resolveFromWorkspaceRoot } from '../utils/workspace-path.util';

export const configuration = () => ({
  storage: {
    root: resolveFromWorkspaceRoot(process.env.STORAGE_ROOT ?? './storage')
  },
  audio: {
    ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
    mockDurationSeconds: Number(process.env.MOCK_AUDIO_DURATION_SECONDS ?? 30),
    enableWhisper: process.env.ENABLE_WHISPER === 'true',
    whisperPythonPath: process.env.WHISPER_PYTHON_PATH ?? 'python',
    whisperModel: process.env.WHISPER_MODEL ?? 'distil-large-v3',
    whisperDevice: process.env.WHISPER_DEVICE ?? 'cuda',
    whisperComputeType: process.env.WHISPER_COMPUTE_TYPE ?? 'float16',
    whisperFallbackDevice: process.env.WHISPER_FALLBACK_DEVICE ?? 'cpu',
    whisperFallbackComputeType: process.env.WHISPER_FALLBACK_COMPUTE_TYPE ?? 'int8',
    whisperTimeoutMs: Number(process.env.WHISPER_TIMEOUT_MS ?? 600000),
    whisperLanguage: process.env.WHISPER_LANGUAGE ?? '',
    whisperExtraPaths: process.env.WHISPER_EXTRA_PATHS ?? ''
  },
  rendering: {
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
    width: Number(process.env.RENDER_WIDTH ?? 1280),
    height: Number(process.env.RENDER_HEIGHT ?? 720),
    frameRate: Number(process.env.RENDER_FRAME_RATE ?? 24)
  },
  interpolation: {
    rifeExecutablePath: resolveFromWorkspaceRoot(
      process.env.RIFE_EXECUTABLE_PATH ?? './tools/rife-ncnn-vulkan/rife-ncnn-vulkan.exe'
    ),
    rifeModelPath: resolveFromWorkspaceRoot(
      process.env.RIFE_MODEL_PATH ?? './tools/rife-ncnn-vulkan/rife-v4.6'
    ),
    gpuId: Number(process.env.RIFE_GPU_ID ?? 0),
    crf: Number(process.env.RIFE_CRF ?? 17),
    preset: process.env.RIFE_FFMPEG_PRESET ?? 'slow'
  },
  ai: {
    enableFallbacks: process.env.ENABLE_AI_FALLBACKS !== 'false',
    enableOllama: process.env.ENABLE_OLLAMA === 'true',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen3:14b',
    ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 180000),
    ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE ?? '0s',
    ollamaThink: process.env.OLLAMA_THINK === 'true'
  },
  visual: {
    provider: process.env.SCENE_VISUAL_PROVIDER ?? 'procedural',
    comfyuiBaseUrl: process.env.COMFYUI_BASE_URL ?? 'http://localhost:8188',
    comfyuiOutputHostPath: resolveFromWorkspaceRoot(
      process.env.COMFYUI_OUTPUT_HOST_PATH ?? './storage/comfyui/output'
    ),
    comfyuiTimeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS ?? 1200000),
    comfyuiPollIntervalMs: Number(process.env.COMFYUI_POLL_INTERVAL_MS ?? 3000),
    comfyuiWorkflowPath: process.env.COMFYUI_WORKFLOW_PATH ?? '',
    comfyuiVideoWorkflowName: process.env.COMFYUI_VIDEO_WORKFLOW_NAME ?? 'wan-2.2-ti2v-5b',
    comfyuiEnableImageFallback: process.env.COMFYUI_ENABLE_IMAGE_FALLBACK === 'true',
    comfyuiCheckpointName: process.env.COMFYUI_CHECKPOINT_NAME ?? '',
    comfyuiVideoUnetName:
      process.env.COMFYUI_VIDEO_UNET_NAME ?? 'wan2.2_ti2v_5B_fp16.safetensors',
    comfyuiVideoClipName:
      process.env.COMFYUI_VIDEO_CLIP_NAME ?? 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    comfyuiVideoClipType: process.env.COMFYUI_VIDEO_CLIP_TYPE ?? 'wan',
    comfyuiVideoVaeName: process.env.COMFYUI_VIDEO_VAE_NAME ?? 'wan2.2_vae.safetensors',
    comfyuiVideoModelShift: Number(process.env.COMFYUI_VIDEO_MODEL_SHIFT ?? 8),
    comfyuiVideoFps: Number(process.env.COMFYUI_VIDEO_FPS ?? 16),
    comfyuiWidth: Number(process.env.COMFYUI_WIDTH ?? 1024),
    comfyuiHeight: Number(process.env.COMFYUI_HEIGHT ?? 576),
    comfyuiSteps: Number(process.env.COMFYUI_STEPS ?? 20),
    comfyuiCfg: Number(process.env.COMFYUI_CFG ?? 5),
    comfyuiSampler: process.env.COMFYUI_SAMPLER ?? 'uni_pc',
    comfyuiScheduler: process.env.COMFYUI_SCHEDULER ?? 'simple',
    characterCheckpointName:
      process.env.CHILDREN_CLIP_CHARACTER_CHECKPOINT_NAME?.trim() ||
      process.env.COMFYUI_CHECKPOINT_NAME ||
      '',
    characterWidth: Number(process.env.CHILDREN_CLIP_CHARACTER_WIDTH ?? 1024),
    characterHeight: Number(process.env.CHILDREN_CLIP_CHARACTER_HEIGHT ?? 1024),
    characterSteps: Number(process.env.CHILDREN_CLIP_CHARACTER_STEPS ?? 30),
    characterCfg: Number(process.env.CHILDREN_CLIP_CHARACTER_CFG ?? 6.5),
    characterSampler: process.env.CHILDREN_CLIP_CHARACTER_SAMPLER ?? 'dpmpp_2m',
    characterScheduler: process.env.CHILDREN_CLIP_CHARACTER_SCHEDULER ?? 'karras',
    characterLoraName: process.env.CHILDREN_CLIP_CHARACTER_LORA_NAME ?? '',
    characterLoraStrength: Number(process.env.CHILDREN_CLIP_CHARACTER_LORA_STRENGTH ?? 1)
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379)
  },
  worker: {
    lockDurationMs: Number(process.env.WORKER_LOCK_DURATION_MS ?? 1800000),
    stalledIntervalMs: Number(process.env.WORKER_STALLED_INTERVAL_MS ?? 30000),
    childrenClipQueueConcurrency: Number(process.env.CHILDREN_CLIP_QUEUE_CONCURRENCY ?? 2)
  },
  gpu: {
    leaseTtlMs: Number(process.env.GPU_LEASE_TTL_MS ?? 180000),
    leasePollMs: Number(process.env.GPU_LEASE_POLL_MS ?? 1000)
  },
  snapgen: {
    apiKey: process.env.SNAPGEN_API_KEY ?? '',
    baseUrl: process.env.SNAPGEN_API_BASE_URL ?? 'https://api.snapgen.ai/uapi/v1',
    pollIntervalMs: Number(process.env.SNAPGEN_POLL_INTERVAL_MS ?? 10000),
    timeoutMs: Number(process.env.SNAPGEN_TIMEOUT_MS ?? 900000),
    requestTimeoutMs: Number(process.env.SNAPGEN_REQUEST_TIMEOUT_MS ?? 30000),
    downloadTimeoutMs: Number(process.env.SNAPGEN_DOWNLOAD_TIMEOUT_MS ?? 120000),
    videoConcurrency: Number(process.env.SNAPGEN_VIDEO_CONCURRENCY ?? 1)
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/video_saas'
  }
});
