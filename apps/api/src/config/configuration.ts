export const configuration = () => ({
  api: {
    port: Number(process.env.API_PORT ?? 3000)
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379)
  }
});
