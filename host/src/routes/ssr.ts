import type { AnyRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import type { Context } from "hono";
import type { AuthVariables } from "../lib/auth";
import { buildPluginContext } from "../services/auth";
import {
  buildRuntimeClientConfig,
  type RuntimeConfig,
  resolveActiveRuntime,
} from "../services/config";
import { loadRouterModule } from "../services/federation.server";
import { createPluginsClient, type PluginResult } from "../services/plugins";
import { getTenantRuntimeErrorResponse, resolveRequestRuntime } from "../services/tenant-runtime";
import { type ComposedUi, composePluginTrees, pluginsWithUi } from "../services/ui-compose";
import type { RouterModule } from "../types";
import { logger } from "../utils/logger";
import { renderClientShell } from "./html";

type HonoEnv = { Variables: AuthVariables };

/**
 * Plugin-ui grafting switch. Composition is opt-in until client-side
 * composition of grafted subtrees ships; with it off, monolith SSR stays
 * byte-identical to the single-remote path.
 */
export function isUiCompositionEnabled(): boolean {
  return process.env.BOS_UI_COMPOSE === "1";
}

export function hasComposablePluginUi(config: RuntimeConfig): boolean {
  return pluginsWithUi(config).length > 0;
}

export function createSsrFallbackHandler(
  config: RuntimeConfig,
  plugins: PluginResult,
  CSP_STRICT: boolean,
) {
  return async (c: Context<HonoEnv>) => {
    if (c.req.path === "/api" || c.req.path.startsWith("/api/")) {
      return c.notFound();
    }

    let resolvedRuntime: Awaited<ReturnType<typeof resolveRequestRuntime>>;
    try {
      resolvedRuntime = await resolveRequestRuntime(config, c.req.raw, {
        verification: "blocking",
      });
    } catch (error) {
      const { message, status } = getTenantRuntimeErrorResponse(error);
      logger.error(`[SSR] ${c.req.method} ${c.req.path} — ${message}`);
      return c.text(message, { status: status as 404 | 500 | 502 });
    }

    const effectiveConfig = resolvedRuntime.config;
    const activeRuntime = resolveActiveRuntime(effectiveConfig, c.req.raw);
    const nonce = CSP_STRICT ? c.get("secureHeadersNonce") : undefined;
    const runtimeConfig = buildRuntimeClientConfig(
      effectiveConfig,
      c.req.raw,
      activeRuntime,
      plugins.auth !== null,
    );

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
      isUiCompositionEnabled() &&
      hasComposablePluginUi(effectiveConfig) &&
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
        const pluginContext = buildPluginContext(c);
        const ssrApiClient = createPluginsClient(plugins, pluginContext);

        const render = () =>
          ssrRouterModule.renderToStream(c.req.raw, {
            session: c.get("session") ? { session: c.get("session"), user: c.get("user") } : null,
            basepath: runtimeConfig.runtime?.runtimeBasePath,
            runtimeConfig,
            apiClient: ssrApiClient,
            cspNonce: nonce,
            routeTree: composedUi?.routeTree,
            pluginNav: composedUi?.nav,
          });

        const result = await render();
        const responseHeaders = new Headers(result?.headers);
        const cspHeader = c.res.headers.get("Content-Security-Policy");
        if (cspHeader) {
          responseHeaders.set("Content-Security-Policy", cspHeader);
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

    return renderClientShell(c, nonce, effectiveConfig, runtimeConfig, moduleLoadError);
  };
}
