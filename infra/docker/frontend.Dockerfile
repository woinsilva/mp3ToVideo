FROM node:24-alpine

WORKDIR /app

COPY . .

RUN corepack enable

CMD ["sh", "-c", "pnpm install && pnpm --filter @video/frontend dev -- --host 0.0.0.0"]
