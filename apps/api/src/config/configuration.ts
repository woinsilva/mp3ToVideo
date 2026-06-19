export const configuration = () => ({
  api: {
    port: Number(process.env.API_PORT ?? 3000)
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d'
  },
  storage: {
    root: process.env.STORAGE_ROOT ?? './storage'
  },
  uploads: {
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50)
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379)
  }
});
