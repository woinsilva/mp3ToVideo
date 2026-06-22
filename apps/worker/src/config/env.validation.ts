import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  STORAGE_ROOT: Joi.string().default('./storage'),
  FFMPEG_PATH: Joi.string().default('ffmpeg'),
  FFPROBE_PATH: Joi.string().default('ffprobe'),
  MOCK_AUDIO_DURATION_SECONDS: Joi.number().positive().default(30),
  ENABLE_WHISPER: Joi.boolean().truthy('true').falsy('false').default(false),
  WHISPER_PYTHON_PATH: Joi.string().default('python'),
  WHISPER_MODEL: Joi.string().default('distil-large-v3'),
  WHISPER_DEVICE: Joi.string().valid('cpu', 'cuda').default('cuda'),
  WHISPER_COMPUTE_TYPE: Joi.string().default('float16'),
  WHISPER_TIMEOUT_MS: Joi.number().integer().positive().default(600000),
  WHISPER_LANGUAGE: Joi.string().allow('').default(''),
  RENDER_WIDTH: Joi.number().integer().positive().default(1280),
  RENDER_HEIGHT: Joi.number().integer().positive().default(720),
  RENDER_FRAME_RATE: Joi.number().integer().positive().default(24),
  ENABLE_OLLAMA: Joi.boolean().truthy('true').falsy('false').default(false),
  OLLAMA_BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:11434'),
  OLLAMA_MODEL: Joi.string().default('qwen3:8b'),
  OLLAMA_TIMEOUT_MS: Joi.number().integer().positive().default(180000),
  ENABLE_AI_FALLBACKS: Joi.boolean().truthy('true').falsy('false').default(true),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  DATABASE_URL: Joi.string().default('postgresql://postgres:postgres@localhost:5432/video_saas')
});
