FROM node:20-alpine
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/whatsapp/package.json packages/whatsapp/
RUN pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm --filter @thalimate/db generate
RUN pnpm --filter @thalimate/worker build

ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
