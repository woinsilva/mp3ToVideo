import { resolveFromWorkspaceRoot } from '../utils/workspace-path.util';

export const configuration = () => ({
  api: {
    port: Number(process.env.API_PORT ?? 3000)
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d'
  },
  storage: {
    root: resolveFromWorkspaceRoot(process.env.STORAGE_ROOT ?? './storage')
  },
  uploads: {
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50)
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379)
  },
  gpu: {
    leaseTtlMs: Number(process.env.GPU_LEASE_TTL_MS ?? 180000),
    leasePollMs: Number(process.env.GPU_LEASE_POLL_MS ?? 1000)
  },
  ai: {
    enableOllama: process.env.ENABLE_OLLAMA === 'true',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen3:8b',
    ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 600000),
    ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE ?? '0s',
    ollamaThink: process.env.OLLAMA_THINK === 'true'
  },
  visual: {
    provider: process.env.SCENE_VISUAL_PROVIDER ?? 'procedural',
    comfyuiBaseUrl: process.env.COMFYUI_BASE_URL ?? 'http://localhost:8188',
    comfyuiHealthTimeoutMs: Number(process.env.COMFYUI_HEALTH_TIMEOUT_MS ?? 5000),
    comfyuiCheckpointName: process.env.COMFYUI_CHECKPOINT_NAME ?? '',
    comfyuiStoryboardWidth: Number(process.env.COMFYUI_STORYBOARD_WIDTH ?? 1536),
    comfyuiStoryboardHeight: Number(process.env.COMFYUI_STORYBOARD_HEIGHT ?? 864),
    comfyuiStoryboardSteps: Number(process.env.COMFYUI_STORYBOARD_STEPS ?? 24),
    comfyuiStoryboardCfg: Number(process.env.COMFYUI_STORYBOARD_CFG ?? 5),
    comfyuiStoryboardSampler: process.env.COMFYUI_STORYBOARD_SAMPLER ?? 'uni_pc',
    comfyuiStoryboardScheduler: process.env.COMFYUI_STORYBOARD_SCHEDULER ?? 'simple'
  },
  snapgen: {
    configured: Boolean(process.env.SNAPGEN_API_KEY?.trim())
  }
});
