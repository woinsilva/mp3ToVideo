FROM node:24-alpine

WORKDIR /app

COPY . .

RUN corepack enable

CMD ["sh", "-c", "pnpm install && pnpm --filter @video/api dev"]
