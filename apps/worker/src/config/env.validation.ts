import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  STORAGE_ROOT: Joi.string().default('./storage'),
  FFPROBE_PATH: Joi.string().default('ffprobe'),
  MOCK_AUDIO_DURATION_SECONDS: Joi.number().positive().default(30),
  ENABLE_AI_FALLBACKS: Joi.boolean().truthy('true').falsy('false').default(true),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  DATABASE_URL: Joi.string().default('postgresql://postgres:postgres@localhost:5432/video_saas')
});
