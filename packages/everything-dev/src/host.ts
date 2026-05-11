import { serve } from "@hono/node-server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import {
  createStitchedRouter,
  type LoadedPluginResult,
  type LoadedPluginsResult,
  loadApiPluginsFromRuntimeConfig,
} from "./api";
import { loadRouterModule, type RouterModule } from "./federation.server";
import type { ClientRuntimeConfig, RuntimeConfig } from "./types";

export interface HostServerConfig {
  runtimeConfig: RuntimeConfig;
  configDir: string;
  port?: number;
}

export interface HostServerHandle {
  ready: Promise<void>;
  shutdown: () => Promise<void>;
}

function buildClientRuntimeConfig(runtimeConfig: RuntimeConfig): ClientRuntimeConfig {
  return {
    env: runtimeConfig.env,
    account: runtimeConfig.account,
    networkId: runtimeConfig.networkId,
    hostUrl: runtimeConfig.host.url,
    assetsUrl: runtimeConfig.ui.url,
    apiBase: "/api",
    rpcBase: "/api/rpc",
    authAvailable: !!runtimeConfig.auth,
    repository: runtimeConfig.repository,
    ui: runtimeConfig.ui
      ? {
          name: runtimeConfig.ui.name,
          url: runtimeConfig.ui.url,
          entry: runtimeConfig.ui.entry,
          integrity: runtimeConfig.ui.integrity,
        }
      : undefined,
    api: runtimeConfig.api
      ? {
          name: runtimeConfig.api.name,
          url: runtimeConfig.api.url,
          entry: runtimeConfig.api.entry,
          integrity: runtimeConfig.api.integrity,
        }
      : undefined,
    plugins: runtimeConfig.plugins
      ? Object.fromEntries(
          Object.entries(runtimeConfig.plugins).map(([key, plugin]) => [
            key,
            {
              name: plugin.name,
              url: plugin.url,
              entry: plugin.entry,
              integrity: plugin.integrity,
            },
          ]),
        )
      : undefined,
  };
}

function renderLoadingShell(runtimeConfig: ClientRuntimeConfig, error?: string | null) {
  const bootstrap = `window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};window.addEventListener('load', function handleEverythingDevHydrate() { window.__hydrate?.(); }, { once: true });`;
  const errorMarkup = error
    ? `<p style="color: #fca5a5;">Error loading UI: ${escapeHtml(error)}</p>`
    : "<p>Loading UI...</p>";

  const uiIntegrity = runtimeConfig.ui?.integrity;
  const sriAttr = uiIntegrity ? ` integrity="${uiIntegrity}" crossorigin="anonymous"` : "";

  return `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Loading...</title>
				<style>
					body { background: #171717; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; }
					.fade { animation: fadeIn 0.3s ease-in; text-align: center; padding: 2rem; }
					@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
				</style>
				${runtimeConfig.assetsUrl ? `<script src="${runtimeConfig.assetsUrl}/remoteEntry.js"${sriAttr}></script>` : ""}
				<script>${bootstrap}</script>
			</head>
			<body>
				<div id="root" class="fade">${errorMarkup}</div>
			</body>
		</html>
	`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createHostServer(config: HostServerConfig): HostServerHandle {
  const port = config.port ?? 3000;
  const { runtimeConfig } = config;

  let shutdownImpl: (() => Promise<void>) | null = null;

  const ready = (async () => {
    const started = await runHostServer({ runtimeConfig, port });
    shutdownImpl = started.shutdown;
  })();

  const shutdown = async () => {
    console.log("[Host] Shutting down...");
    const timeout = setTimeout(() => {
      console.log("[Host] Force exit");
      process.exit(0);
    }, 5000);
    await ready.catch(() => {});
    if (shutdownImpl) {
      await shutdownImpl().catch(() => {});
    }
    clearTimeout(timeout);
    console.log("[Host] Shutdown complete");
  };

  return { ready, shutdown };
}

async function runHostServer(opts: {
  runtimeConfig: RuntimeConfig;
  port: number;
}): Promise<{ shutdown: () => Promise<void> }> {
  const { runtimeConfig, port } = opts;

  let apiPlugins: LoadedPluginResult[] = [];
  let baseApiPlugin: LoadedPluginResult | null = null;
  let apiPluginError: string | null = null;
  let apiPluginLoading: Promise<LoadedPluginsResult | null> | null = null;
  let ssrRouterModule: RouterModule | null = null;
  let ssrRouterError: string | null = null;
  let ssrRouterLoading: Promise<RouterModule | null> | null = null;
  let rpcHandler: RPCHandler<any> | null = null;
  let openApiHandler: OpenAPIHandler<any> | null = null;

  const clientRuntimeConfig = buildClientRuntimeConfig(runtimeConfig);

  const initApiHandlers = () => {
    const baseRouter = baseApiPlugin?.router ?? {};
    const stitchedRouter = createStitchedRouter(
      baseRouter,
      apiPlugins.filter((plugin) => plugin.key !== "api"),
    );

    if (!baseApiPlugin) {
      rpcHandler = null;
      openApiHandler = null;
      return;
    }

    rpcHandler = new RPCHandler(stitchedRouter as any, {
      plugins: [new BatchHandlerPlugin()],
    });
    openApiHandler = new OpenAPIHandler(stitchedRouter as any, {
      plugins: [
        new OpenAPIReferencePlugin({
          schemaConverters: [new ZodToJsonSchemaConverter()],
        }),
      ],
    });
  };

  const ensureApiPluginLoaded = async (): Promise<LoadedPluginsResult | null> => {
    if (apiPlugins.length > 0) return { base: baseApiPlugin, plugins: apiPlugins, errors: [] };
    if (!runtimeConfig.api) return null;
    if (apiPluginLoading) return apiPluginLoading;

    apiPluginLoading = loadApiPluginsFromRuntimeConfig(runtimeConfig, process.env as any)
      .then((loaded) => {
        if (loaded) {
          apiPlugins = loaded.plugins;
          baseApiPlugin = loaded.base;
          apiPluginError =
            loaded.errors.length > 0 ? loaded.errors.map((item) => item.error).join("; ") : null;
          initApiHandlers();
        }
        return loaded;
      })
      .catch((e) => {
        apiPluginError = e instanceof Error ? e.message : String(e);
        return null;
      })
      .finally(() => {
        apiPluginLoading = null;
      });

    return apiPluginLoading;
  };

  const ensureRouterModuleLoaded = async (): Promise<RouterModule | null> => {
    if (ssrRouterModule) {
      return ssrRouterModule;
    }

    if (ssrRouterLoading) {
      return ssrRouterLoading;
    }

    ssrRouterLoading = loadRouterModule(runtimeConfig)
      .then((routerModule) => {
        ssrRouterModule = routerModule;
        ssrRouterError = null;
        return routerModule;
      })
      .catch((error) => {
        ssrRouterError = error instanceof Error ? error.message : String(error);
        return null;
      })
      .finally(() => {
        ssrRouterLoading = null;
      });

    return ssrRouterLoading;
  };

  // Kick off API plugin load in the background; host should still start even if
  // the remote isn't ready yet.
  void ensureApiPluginLoaded();
  void ensureRouterModuleLoaded();

  const app = new Hono();

  const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? [
    runtimeConfig.host.url,
    ...(runtimeConfig.ui?.url ? [runtimeConfig.ui.url] : []),
  ];

  if (!process.env.CORS_ORIGIN && runtimeConfig.env === "production") {
    console.warn(
      "[Security] CORS_ORIGIN is not set in production. Using host and UI URLs as allowed origins.",
    );
  }

  app.use(
    "/*",
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  app.use("*", secureHeaders({ crossOriginOpenerPolicy: "same-origin-allow-popups" }));

  app.get("/health", (c) => c.text("OK"));
  app.get("/ready", async (c) => {
    type Check = {
      name: string;
      url: string;
      required: boolean;
      ok: boolean;
      status?: number;
      latencyMs?: number;
      error?: string;
    };

    const probe = async (url: string, timeoutMs = 400): Promise<Check> => {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        return {
          name: "",
          url,
          required: true,
          ok: res.ok,
          status: res.status,
          latencyMs: Date.now() - started,
        };
      } catch (e) {
        return {
          name: "",
          url,
          required: true,
          ok: false,
          latencyMs: Date.now() - started,
          error: e instanceof Error ? e.message : String(e),
        };
      } finally {
        clearTimeout(timer);
      }
    };

    const checks: Check[] = [];

    if (runtimeConfig.ui?.url) {
      const base = runtimeConfig.ui.url.replace(/\/$/, "");
      const manifest = await probe(`${base}/mf-manifest.json`);
      manifest.name = "ui";
      // mf-manifest.json is preferred but not always present; fall back to
      // remoteEntry.js for readiness.
      manifest.required = false;
      checks.push(manifest);
      if (!manifest.ok) {
        const remoteEntry = await probe(`${base}/remoteEntry.js`);
        remoteEntry.name = "ui";
        remoteEntry.required = true;
        checks.push(remoteEntry);
      } else {
        manifest.required = true;
      }
    }

    if (runtimeConfig.ui?.ssrUrl) {
      const base = runtimeConfig.ui.ssrUrl.replace(/\/$/, "");
      const ssr = await probe(`${base}/`);
      ssr.name = "ui-ssr";
      ssr.required = false;
      checks.push(ssr);
    }

    if (runtimeConfig.api?.url) {
      const base = runtimeConfig.api.url.replace(/\/$/, "");
      const api = await probe(`${base}/`);
      api.name = "api";
      api.required = true;
      checks.push(api);
    }

    if (runtimeConfig.api) {
      checks.push({
        name: "api-plugin",
        url: runtimeConfig.api.entry,
        required: true,
        ok: baseApiPlugin !== null,
        status: baseApiPlugin !== null ? 200 : 503,
        error:
          baseApiPlugin !== null
            ? undefined
            : apiPluginLoading
              ? "loading"
              : (apiPluginError ?? "not loaded"),
      });
      if (!baseApiPlugin && !apiPluginLoading) {
        void ensureApiPluginLoaded();
      }
    }

    for (const [key, plugin] of Object.entries(runtimeConfig.plugins ?? {})) {
      const loaded = apiPlugins.find((item) => item.key === key);
      checks.push({
        name: key,
        url: plugin.entry,
        required: true,
        ok: Boolean(loaded),
        status: loaded ? 200 : 503,
        error: loaded ? undefined : (apiPluginError ?? "not loaded"),
      });
    }

    const allRequiredOk = checks.filter((x) => x.required).every((x) => x.ok);

    return c.json(
      {
        status: allRequiredOk ? "ready" : "not_ready",
        host: {
          url: runtimeConfig.host.url,
          env: runtimeConfig.env,
        },
        checks,
        timestamp: new Date().toISOString(),
      },
      allRequiredOk ? 200 : 503,
    );
  });
  app.get("/api/_health", (c) =>
    c.json({
      status: "ready",
      mode: runtimeConfig.env,
      ui: runtimeConfig.ui?.url ?? null,
      uiSsr: runtimeConfig.ui?.ssrUrl ?? null,
      ssrRouterLoaded: ssrRouterModule !== null,
      ssrRouterLoading: ssrRouterLoading !== null,
      ssrRouterError,
      api: runtimeConfig.api?.url ?? null,
      apiPluginLoaded: baseApiPlugin !== null,
      apiPluginLoading: apiPluginLoading !== null,
      apiPluginError,
    }),
  );

  app.all("/api/rpc/*", async (c) => {
    if (!rpcHandler) {
      await ensureApiPluginLoaded();
    }
    if (!rpcHandler) {
      return c.json({ error: "API plugin not loaded", detail: apiPluginError }, 503);
    }
    const result = await rpcHandler.handle(c.req.raw, {
      prefix: "/api/rpc",
      context: {},
    });
    return result.response
      ? c.newResponse(result.response.body, result.response)
      : c.text("Not Found", 404);
  });

  app.all("/api/*", async (c) => {
    if (!openApiHandler) {
      await ensureApiPluginLoaded();
    }
    if (!openApiHandler) {
      return c.json({ error: "API plugin not loaded", detail: apiPluginError }, 503);
    }
    const result = await openApiHandler.handle(c.req.raw, {
      prefix: "/api",
      context: {},
    });
    return result.response
      ? c.newResponse(result.response.body, result.response)
      : c.text("Not Found", 404);
  });

  if (runtimeConfig.ui) {
    app.all("/__mf/ui/*", async (c) => {
      const targetUrl = `${runtimeConfig.ui!.url}${c.req.path.replace("/__mf/ui", "")}`;
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers: c.req.header(),
      });
      return response;
    });

    if (runtimeConfig.ui.ssrUrl) {
      app.all("/__mf/ui/ssr/*", async (c) => {
        const targetUrl = `${runtimeConfig.ui!.ssrUrl}${c.req.path.replace("/__mf/ui/ssr", "")}`;
        const response = await fetch(targetUrl, {
          method: c.req.method,
          headers: c.req.header(),
        });
        return response;
      });
    }
  }

  app.get("*", async (c) => {
    const routerModule = await ensureRouterModuleLoaded();

    if (!routerModule) {
      return c.html(renderLoadingShell(clientRuntimeConfig, ssrRouterError), 503);
    }

    try {
      const apiClient = baseApiPlugin?.createClient();

      const result = await routerModule.renderToStream(c.req.raw, {
        assetsUrl: runtimeConfig.ui.url,
        runtimeConfig: clientRuntimeConfig,
        apiClient,
      });

      return new Response(result.stream, {
        status: result.statusCode,
        headers: result.headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.html(renderLoadingShell(clientRuntimeConfig, message), 500);
    }
  });

  const hostname = process.env.HOST ?? "0.0.0.0";
  let resolveReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const proxiedFetch = (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const forwardedHost = req.headers.get("x-forwarded-host");

    if (forwardedProto) {
      url.protocol = forwardedProto;
    }
    if (forwardedHost) {
      url.host = forwardedHost;
    }

    if (forwardedProto || forwardedHost) {
      req = new Request(url, req);
    }

    return app.fetch(req);
  };

  const server = serve({ fetch: proxiedFetch, port, hostname }, (info) => {
    console.log(`[Host] Server running at http://${hostname}:${info.port}`);
    console.log(`[Host] API: http://${hostname}:${info.port}/api/rpc`);
    resolveReady?.();
  });

  await ready;

  return {
    shutdown: () =>
      new Promise<void>((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve();
        }
      }),
  };
}

export { runHostServer };
