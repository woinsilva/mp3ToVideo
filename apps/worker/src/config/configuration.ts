export const configuration = () => ({
  storage: {
    root: process.env.STORAGE_ROOT ?? './storage'
  },
  audio: {
    ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
    mockDurationSeconds: Number(process.env.MOCK_AUDIO_DURATION_SECONDS ?? 30)
  },
  ai: {
    enableFallbacks: process.env.ENABLE_AI_FALLBACKS !== 'false'
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379)
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/video_saas'
  }
});
