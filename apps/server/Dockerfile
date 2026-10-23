FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests and install dependencies.
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json

RUN npm ci

# Copy server source and compile TypeScript.
COPY apps/server/ ./apps/server/

WORKDIR /app/apps/server

RUN npm run build

# Production image.
FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json

RUN npm ci --omit=dev

COPY --from=builder /app/apps/server/dist ./apps/server/dist

WORKDIR /app/apps/server

EXPOSE 5000

CMD ["node", "dist/index.js"]