import type { AnyRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { renderClientShell } from "../routes/html";
import type { RouterModule } from "../types";
import { logger } from "../utils/logger";
import {
  buildRuntimeClientConfig,
  type ClientRuntimeConfig,
  type RuntimeConfig,
  resolveActiveRuntime,
} from "./config";
import { loadRouterModule } from "./federation.server";
import { createPluginsClient, type PluginResult } from "./plugins";
import { getTenantRuntimeErrorResponse, resolveRequestRuntime } from "./tenant-runtime";
import { type ComposedUi, composePluginTrees, hasComposablePluginUi } from "./ui-compose";

/**
 * One seam from request to stream: tenant resolution, SSR gating, plugin-ui
 * composition, module loading, streaming render, and the client-shell fallback
 * all live behind `render(request, ctx) -> Response`. No Hono, no framework —
 * plain Request in, Response out, so the whole pipeline is testable through
 * the interface.
 */

export interface SsrRenderDeps {
  config: RuntimeConfig;
  plugins: PluginResult;
}

export interface SsrRenderRequestContext {
  session: unknown;
  user: unknown;
  pluginContext: Record<string, unknown>;
  cspNonce?: string;
  cspHeader?: string | null;
}

/**
 * Plugin-ui grafting switch. Composition is opt-in until client-side
 * composition of grafted subtrees ships; with it off, monolith SSR stays
 * byte-identical to the single-remote path.
 */
export function isUiCompositionEnabled(): boolean {
  return process.env.BOS_UI_COMPOSE === "1";
}

export function isUiCompositionReady(config: RuntimeConfig): boolean {
  return isUiCompositionEnabled() && hasComposablePluginUi(config);
}

interface CachedClientConfig {
  expiresAt: number;
  value: ClientRuntimeConfig;
}

const CLIENT_CONFIG_TTL_MS = 30_000;
const MAX_CLIENT_CONFIG_CACHE_SIZE = 512;

const clientConfigCache = new Map<string, CachedClientConfig>();

function clearTimeoutEntries<T extends { expiresAt: number }>(cache: Map<string, T>, now: number) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function enforceClientConfigLimit(cache: Map<string, CachedClientConfig>, maxSize: number) {
  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

/**
 * The client runtime payload only varies with tenant identity, request
 * origin, and auth availability — rebuild it once per window instead of once
 * per request. Invalidation rides the same 30s tenant-config TTL.
 */
function buildClientConfigCached(inputs: {
  effectiveConfig: RuntimeConfig;
  request: Request;
  tenantAccountId: string | null;
  authAvailable: boolean;
}): ClientRuntimeConfig {
  const now = Date.now();
  clearTimeoutEntries(clientConfigCache, now);
  const origin = new URL(inputs.request.url).origin;
  const cacheKey = `${inputs.tenantAccountId ?? "base"}::${origin}::${inputs.authAvailable}`;
  const cached = clientConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const activeRuntime = resolveActiveRuntime(inputs.effectiveConfig, inputs.request);
  const value = buildRuntimeClientConfig(
    inputs.effectiveConfig,
    inputs.request,
    activeRuntime,
    inputs.authAvailable,
  );
  clientConfigCache.set(cacheKey, { value, expiresAt: now + CLIENT_CONFIG_TTL_MS });
  enforceClientConfigLimit(clientConfigCache, MAX_CLIENT_CONFIG_CACHE_SIZE);
  return value;
}

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=UTF-8" },
  });
}

export function createSsrRender(deps: SsrRenderDeps) {
  return async (request: Request, ctx: SsrRenderRequestContext): Promise<Response> => {
    const pathname = new URL(request.url).pathname;

    let resolved: Awaited<ReturnType<typeof resolveRequestRuntime>>;
    try {
      resolved = await resolveRequestRuntime(deps.config, request, {
        verification: "blocking",
      });
    } catch (error) {
      const { message, status } = getTenantRuntimeErrorResponse(error);
      logger.error(`[SSR] ${request.method} ${pathname} — ${message}`);
      return textResponse(message, status);
    }

    const effectiveConfig = resolved.config;
    const runtimeConfig = buildClientConfigCached({
      effectiveConfig,
      request,
      tenantAccountId: resolved.tenantAccountId,
      authAvailable: deps.plugins.auth !== null,
    });

    let ssrRouterModule: RouterModule | null = null;
    let moduleLoadError: Error | null = null;
    let composedUi: ComposedUi | null = null;
    let composeWarnings: string[] = [];

    if (effectiveConfig.ui.ssrUrl) {
      try {
        ssrRouterModule = await Effect.runPromise(loadRouterModule(effectiveConfig));
      } catch (error) {
        moduleLoadError = error instanceof Error ? error : new Error(String(error));
        logger.error("[SSR] Failed to load Router module:", moduleLoadError);
      }
    }

    if (
      ssrRouterModule &&
      effectiveConfig.ui.ssrUrl &&
      isUiCompositionReady(effectiveConfig) &&
      ssrRouterModule.routeTree
    ) {
      try {
        const result = await Effect.runPromise(
          composePluginTrees({
            coreTree: ssrRouterModule.routeTree as AnyRoute,
            config: effectiveConfig,
          }),
        );
        composedUi = result.composed;
        composeWarnings = result.warnings;
        for (const warning of composeWarnings) {
          logger.warn(`[SSR] Compose warning: ${warning}`);
        }
      } catch (error) {
        logger.error("[SSR] Compose plugin trees failed:", error);
      }
    }

    if (ssrRouterModule && effectiveConfig.ui.ssrUrl) {
      try {
        const ssrApiClient = createPluginsClient(deps.plugins, ctx.pluginContext);

        const result = await ssrRouterModule.renderToStream(request, {
          session: ctx.session ? { session: ctx.session, user: ctx.user } : null,
          basepath: runtimeConfig.runtime?.runtimeBasePath,
          runtimeConfig,
          apiClient: ssrApiClient,
          cspNonce: ctx.cspNonce,
          routeTree: composedUi?.routeTree,
          pluginNav: composedUi?.nav,
        });

        const responseHeaders = new Headers(result?.headers);
        if (ctx.cspHeader) {
          responseHeaders.set("Content-Security-Policy", ctx.cspHeader);
        }
        return new Response(result?.stream, {
          status: result?.statusCode,
          headers: responseHeaders,
        });
      } catch (error) {
        logger.error("[SSR] Streaming error:", error);
        moduleLoadError = error as Error;
      }
    }

    return renderClientShell(
      ctx.cspNonce,
      effectiveConfig,
      runtimeConfig,
      moduleLoadError,
      ctx.cspHeader,
    );
  };
}
