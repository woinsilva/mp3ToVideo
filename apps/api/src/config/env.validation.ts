import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().default(3000),
  JWT_SECRET: Joi.string().min(8).default('change-me'),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  STORAGE_ROOT: Joi.string().default('./storage'),
  MAX_UPLOAD_MB: Joi.number().integer().positive().default(50),
  DATABASE_PROVIDER: Joi.string().valid('postgresql', 'sqlite').default('postgresql'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  DATABASE_URL: Joi.string().default('postgresql://postgres:postgres@localhost:5432/video_saas')
});
