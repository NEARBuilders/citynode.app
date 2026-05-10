# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run --cwd packages/every-plugin build
RUN bun run postinstall
RUN bun run scripts/resolve-workspace-refs.ts

# Compile the CLI into a standalone binary
RUN cd packages/everything-dev && bun run build
RUN cd packages/everything-dev && bun build --compile src/cli.ts --outfile /app/bos-cli

FROM alpine:latest
WORKDIR /app

RUN apk add --no-cache curl ca-certificates

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001

COPY --from=builder --chown=appuser:appgroup /app/bos-cli /usr/local/bin/bos
COPY --from=builder --chown=appuser:appgroup /app/bos.config.json ./

RUN mkdir -p .bos/generated .bos/logs && \
    chown -R appuser:appgroup .bos && \
    chown appuser:appgroup /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

USER appuser
CMD ["bos", "start", "--port", "3000", "--env", "production", "--no-interactive"]
