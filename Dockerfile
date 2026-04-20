# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4-alpine AS base
WORKDIR /app

RUN apk add --no-cache curl

COPY package.json bun.lock bunfig.toml ./
COPY */package.json ./*/

RUN bun install --frozen-lockfile

COPY . .

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

USER appuser
CMD ["bun", "run", "start"]
