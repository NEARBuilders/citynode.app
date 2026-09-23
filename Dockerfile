# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14-alpine AS builder
WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run --cwd packages/every-plugin build
RUN bun run --cwd packages/everything-dev build
RUN bun run scripts/resolve-workspace-refs.ts

# ── Regression build (ADR 0009): all workspaces the local start stack serves ──
# Forked BEFORE the prod stage strips sources — the ui/api/plugins builds run here.
FROM builder AS regression-builder
RUN bun run --cwd packages/better-near-auth build
RUN bun run scripts/regression/container-build.ts

# ── Prod build: strip sources — everything loads remotely at runtime ──
FROM builder AS prod-builder

RUN rm -rf host api ui plugins

# Clean broken workspace symlinks and strip workspace entries from package.json
RUN find node_modules -maxdepth 1 -type l ! -exec test -e {} \; -print -delete 2>/dev/null || true
RUN node -e "const p=require('./package.json');p.workspaces.packages=p.workspaces.packages.filter(e=>!['api','ui','host'].includes(e)&&e!=='plugins/*');require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"

# ── Runtime ──
FROM oven/bun:1.3.14-alpine
WORKDIR /app

RUN apk add --no-cache curl

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001

COPY --from=prod-builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=prod-builder --chown=appuser:appgroup /app/package.json .
COPY --from=prod-builder --chown=appuser:appgroup /app/bun.lock .
COPY --from=prod-builder --chown=appuser:appgroup /app/bunfig.toml .
COPY --from=prod-builder --chown=appuser:appgroup /app/bos.config.json ./
COPY --from=prod-builder --chown=appuser:appgroup /app/packages/everything-dev ./packages/everything-dev
COPY --from=prod-builder --chown=appuser:appgroup /app/packages/every-plugin ./packages/every-plugin

RUN mkdir -p .bos/generated .bos/logs && \
    chown -R appuser:appgroup .bos && \
    chown appuser:appgroup /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# BOS_ENV: set to "staging" to enable staging mode (uses staging domain for BOS_GATEWAY)
# Defaults to "production" if unset.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

USER appuser
CMD ["sh", "-c", "bun run start --port ${PORT:-3000}"]

# ── Regression runtime (ADR 0009): serves the staged dists and boots the
# production host over them. One container = the whole start stack; only the
# host port is mapped. Databases and secrets arrive via env at `docker run`.
FROM oven/bun:1.3.14-alpine AS regression
WORKDIR /app

RUN apk add --no-cache curl

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001

COPY --from=regression-builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=regression-builder --chown=appuser:appgroup /app/package.json .
COPY --from=regression-builder --chown=appuser:appgroup /app/bun.lock .
COPY --from=regression-builder --chown=appuser:appgroup /app/bunfig.toml .
COPY --from=regression-builder --chown=appuser:appgroup /app/bos.config.json ./
COPY --from=regression-builder --chown=appuser:appgroup /app/packages/everything-dev ./packages/everything-dev
COPY --from=regression-builder --chown=appuser:appgroup /app/packages/every-plugin ./packages/every-plugin
COPY --from=regression-builder --chown=appuser:appgroup /app/packages/better-near-auth ./packages/better-near-auth
COPY --from=regression-builder --chown=appuser:appgroup /app/scripts/regression ./scripts/regression
COPY --from=regression-builder --chown=appuser:appgroup /app/.bos/regression/image ./.bos/regression/image

RUN mkdir -p .bos/generated .bos/logs && \
    chown -R appuser:appgroup .bos && \
    chown appuser:appgroup /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100
EXPOSE 4100

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:4100/health || exit 1

USER appuser
ENTRYPOINT ["bun", "run", "scripts/regression/container-entrypoint.mjs"]
