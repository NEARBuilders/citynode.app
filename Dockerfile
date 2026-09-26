# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14-alpine AS builder
WORKDIR /app

# NOTE: do NOT split this into a manifests-first COPY + install. Bun's frozen
# install resolves a different tree on a manifests-only context than on a full
# checkout (and skips workspace bin links whose targets are absent), which
# breaks the lockfile check and the workspace build scripts. Full source + a
# cache mount keeps re-downloads free when the layer busts.
COPY . .

RUN --mount=type=cache,id=s/2532431a-4bd9-48a4-ac79-e7aeac2fedb4-/root/.bun/install/cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

RUN test -e node_modules/.bin/every-plugin \
    || { echo "workspace bin not linked — bun skips bin links whose targets are absent at install time"; exit 1; }
RUN bun run --cwd packages/every-plugin build
RUN bun run --cwd packages/everything-dev build
RUN bun run scripts/resolve-workspace-refs.ts

# ── Dist build (ADR 0009): all workspaces the start stack serves ──
# Forked BEFORE the prod stage strips sources — the ui/api/plugins builds run here.
FROM builder AS dist-builder
RUN bun run scripts/regression/container-build.ts

# ── Prod build: strip sources — the framework loads remotes at runtime ──
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

# Image-native artifacts (plan 043): the namespace-staged bundle layout built
# by the dist-builder stage — the host serves /bundles/* from this directory.
# BOS_BUNDLE_DIR unset in other consumers falls through to remote loading.
COPY --from=dist-builder --chown=appuser:appgroup /app/.bos/bundles ./.bos/bundles
ENV BOS_BUNDLE_DIR=/app/.bos/bundles

RUN mkdir -p .bos/generated .bos/logs && \
    chown -R appuser:appgroup .bos && \
    chown appuser:appgroup /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# BOS_ENV: set to "staging" to enable staging mode (uses staging domain for BOS_GATEWAY)
# Defaults to "production" if unset.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

USER appuser
CMD ["sh", "-c", "bun run start --port ${PORT:-3000}"]

# ── Deployment runtime (ADR 0009 amendment): the last stage — what Railway
# builds and deploys. Serves the staged dists and boots the production host
# over them. One container = the whole start stack; only the host port is
# mapped. Databases and secrets arrive via env at `docker run`. The
# regression harness builds this same target for its browser suites.
FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001

COPY --from=dist-builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=dist-builder --chown=appuser:appgroup /app/package.json .
COPY --from=dist-builder --chown=appuser:appgroup /app/bun.lock .
COPY --from=dist-builder --chown=appuser:appgroup /app/bunfig.toml .
COPY --from=dist-builder --chown=appuser:appgroup /app/bos.config.json ./
COPY --from=dist-builder --chown=appuser:appgroup /app/packages/everything-dev ./packages/everything-dev
COPY --from=dist-builder --chown=appuser:appgroup /app/packages/every-plugin ./packages/every-plugin
COPY --from=dist-builder --chown=appuser:appgroup /app/packages/better-near-auth ./packages/better-near-auth
COPY --from=dist-builder --chown=appuser:appgroup /app/scripts/regression ./scripts/regression
COPY --from=dist-builder --chown=appuser:appgroup /app/.bos/regression/image ./.bos/regression/image
COPY --from=dist-builder --chown=appuser:appgroup /app/.bos/bundles ./.bos/bundles
ENV BOS_BUNDLE_DIR=/app/.bos/bundles

RUN mkdir -p .bos/generated .bos/logs && \
    chown -R appuser:appgroup .bos && \
    chown appuser:appgroup /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100
EXPOSE 4100

HEALTHCHECK --interval=10s --timeout=3s --start-period=180s --retries=5 \
  CMD curl -f http://localhost:4100/health || exit 1

USER appuser
ENTRYPOINT ["bun", "run", "scripts/regression/container-entrypoint.mjs"]
