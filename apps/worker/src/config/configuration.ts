export const configuration = () => ({
  storage: {
    root: process.env.STORAGE_ROOT ?? './storage'
  },
  audio: {
    ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
    mockDurationSeconds: Number(process.env.MOCK_AUDIO_DURATION_SECONDS ?? 30),
    enableWhisper: process.env.ENABLE_WHISPER === 'true',
    whisperPythonPath: process.env.WHISPER_PYTHON_PATH ?? 'python',
    whisperModel: process.env.WHISPER_MODEL ?? 'distil-large-v3',
    whisperDevice: process.env.WHISPER_DEVICE ?? 'cuda',
    whisperComputeType: process.env.WHISPER_COMPUTE_TYPE ?? 'float16',
    whisperTimeoutMs: Number(process.env.WHISPER_TIMEOUT_MS ?? 600000),
    whisperLanguage: process.env.WHISPER_LANGUAGE ?? ''
  },
  rendering: {
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
    width: Number(process.env.RENDER_WIDTH ?? 1280),
    height: Number(process.env.RENDER_HEIGHT ?? 720),
    frameRate: Number(process.env.RENDER_FRAME_RATE ?? 24)
  },
  ai: {
    enableFallbacks: process.env.ENABLE_AI_FALLBACKS !== 'false',
    enableOllama: process.env.ENABLE_OLLAMA === 'true',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen3:8b',
    ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 180000)
  },
  visual: {
    provider: process.env.SCENE_VISUAL_PROVIDER ?? 'procedural',
    comfyuiBaseUrl: process.env.COMFYUI_BASE_URL ?? 'http://localhost:8188',
    comfyuiOutputHostPath: process.env.COMFYUI_OUTPUT_HOST_PATH ?? './storage/comfyui/output',
    comfyuiTimeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS ?? 300000),
    comfyuiPollIntervalMs: Number(process.env.COMFYUI_POLL_INTERVAL_MS ?? 3000),
    comfyuiCheckpointName:
      process.env.COMFYUI_CHECKPOINT_NAME ?? 'sd_xl_turbo_1.0.safetensors',
    comfyuiVideoUnetName:
      process.env.COMFYUI_VIDEO_UNET_NAME ?? 'wan2.2_ti2v_5B_fp16.safetensors',
    comfyuiVideoClipName:
      process.env.COMFYUI_VIDEO_CLIP_NAME ?? 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    comfyuiVideoClipType: process.env.COMFYUI_VIDEO_CLIP_TYPE ?? 'wan',
    comfyuiVideoVaeName: process.env.COMFYUI_VIDEO_VAE_NAME ?? 'wan2.2_vae.safetensors',
    comfyuiVideoModelShift: Number(process.env.COMFYUI_VIDEO_MODEL_SHIFT ?? 8),
    comfyuiVideoFps: Number(process.env.COMFYUI_VIDEO_FPS ?? 24),
    comfyuiWidth: Number(process.env.COMFYUI_WIDTH ?? 1024),
    comfyuiHeight: Number(process.env.COMFYUI_HEIGHT ?? 576),
    comfyuiSteps: Number(process.env.COMFYUI_STEPS ?? 20),
    comfyuiCfg: Number(process.env.COMFYUI_CFG ?? 5),
    comfyuiSampler: process.env.COMFYUI_SAMPLER ?? 'uni_pc',
    comfyuiScheduler: process.env.COMFYUI_SCHEDULER ?? 'simple'
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379)
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/video_saas'
  }
});
