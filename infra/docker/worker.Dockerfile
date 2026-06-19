FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY . .

RUN corepack enable

CMD ["sh", "-c", "pnpm install && pnpm --filter @video/worker dev"]
