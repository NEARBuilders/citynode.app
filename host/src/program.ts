import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime } from "every-plugin/effect";
import { formatORPCError } from "every-plugin/errors";
import { onError } from "every-plugin/orpc";
import { getBaseStyles, getHydrateScript, getThemeInitScript } from "everything-dev/ui/head";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { BaseLive, PluginsLive } from "./layers";
import { type Auth, AuthService } from "./services/auth";
import { type ClientRuntimeConfig, ConfigService, type RuntimeConfig } from "./services/config";
import { createRequestContext } from "./services/context";
import { type Database, DatabaseService } from "./services/database";
import { loadRouterModule, type RouterModule } from "./services/federation.server";
import { createPluginsClient, type PluginResult, PluginsService } from "./services/plugins";
import { createRouterMounts } from "./services/router";
import { logger } from "./utils/logger";

type ActiveRuntimeState = NonNullable<ClientRuntimeConfig["runtime"]>;

type RuntimeClientConfig = ClientRuntimeConfig & { runtime?: ActiveRuntimeState };

type RuntimePlugin = NonNullable<RuntimeConfig["plugins"]>[string];

function normalizeUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
}

function getRuntimeOverride(pathname: string) {
  const match = pathname.match(/^\/_runtime\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }

  const [, encodedAccountId, encodedGatewayId] = match;
  const accountId = decodeURIComponent(encodedAccountId);
  const gatewayId = decodeURIComponent(encodedGatewayId);

  return {
    accountId,
    gatewayId,
    runtimeBasePath: `/_runtime/${encodeURIComponent(accountId)}/${encodeURIComponent(gatewayId)}`,
  };
}

function getFallbackGatewayId(config: RuntimeConfig) {
  if (config.domain) {
    return config.domain;
  }

  if (process.env.GATEWAY_DOMAIN) {
    return process.env.GATEWAY_DOMAIN;
  }

  return normalizeUrl(config.hostUrl)?.replace(/^https?:\/\//, "") ?? "runtime";
}

async function resolveActiveRuntime(config: RuntimeConfig, request: Request) {
  const url = new URL(request.url);
  const override = getRuntimeOverride(url.pathname);

  if (override) {
    return {
      accountId: override.accountId,
      gatewayId: override.gatewayId,
      runtimeBasePath: override.runtimeBasePath,
      title: `${override.accountId}/${override.gatewayId}`,
      hostUrl: url.origin,
    } satisfies ActiveRuntimeState;
  }

  const fallbackGatewayId = getFallbackGatewayId(config);
  return {
    accountId: config.account,
    gatewayId: fallbackGatewayId,
    runtimeBasePath: "/",
    title: config.account,
    hostUrl: url.origin,
  } satisfies ActiveRuntimeState;
}

function registerAllPaths(
  app: Hono,
  paths: string[],
  handler: (c: Context) => Response | Promise<Response>,
) {
  for (const path of paths) {
    app.all(path, handler);
  }
}

function buildRuntimeClientConfig(
  config: RuntimeConfig,
  request: Request,
  activeRuntime: ActiveRuntimeState,
): RuntimeClientConfig {
  const requestUrl = new URL(request.url);
  const uiConfig = config.ui;

  if (!uiConfig) {
    throw new Error("UI config is required to build the runtime client config");
  }

  return {
    env: config.env,
    account: activeRuntime.accountId,
    networkId: config.account.endsWith(".testnet") ? "testnet" : "mainnet",
    hostUrl: requestUrl.origin,
    assetsUrl: uiConfig.url,
    apiBase: "/api",
    rpcBase: "/api/rpc",
    repository: config.repository,
    ui: {
      name: uiConfig.name,
      url: uiConfig.url,
      entry: uiConfig.entry,
      integrity: uiConfig.integrity,
    },
    api: config.api
      ? {
          name: config.api.name,
          url: config.api.url,
          entry: config.api.entry,
          integrity: config.api.integrity,
        }
      : undefined,
    plugins: Object.fromEntries(
      (Object.entries(config.plugins ?? {}) as Array<[string, RuntimePlugin]>).map(
        ([key, plugin]) => [
          key,
          {
            name: plugin.name,
            url: plugin.url,
            entry: plugin.entry,
            integrity: plugin.integrity,
          },
        ],
      ),
    ),
    runtime: activeRuntime,
  } as RuntimeClientConfig;
}

function extractErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  cause?: string;
} {
  if (!error) return { message: "Unknown error (null/undefined)" };

  if (error instanceof Error) {
    const details: { message: string; stack?: string; cause?: string } = {
      message: error.message || error.name || "Error",
      stack: error.stack,
    };

    if (error.cause) {
      if (error.cause instanceof Error) {
        details.cause = `${error.cause.name}: ${error.cause.message}`;
      } else if (typeof error.cause === "object" && "_tag" in (error.cause as object)) {
        try {
          const squashed = Cause.squash(error.cause as Cause.Cause<unknown>);
          if (squashed instanceof Error) {
            details.cause = `[Effect] ${squashed.name}: ${squashed.message}`;
          } else {
            details.cause = `[Effect] ${String(squashed)}`;
          }
        } catch {
          details.cause = `[Effect Cause] ${JSON.stringify(error.cause)}`;
        }
      } else {
        details.cause = String(error.cause);
      }
    }

    return details;
  }

  if (typeof error === "object" && error !== null) {
    if ("_tag" in error) {
      try {
        const squashed = Cause.squash(error as Cause.Cause<unknown>);
        return extractErrorDetails(squashed);
      } catch {
        return { message: `[Effect] ${JSON.stringify(error)}` };
      }
    }

    if ("message" in error) {
      return { message: String((error as { message: unknown }).message) };
    }

    return { message: JSON.stringify(error) };
  }

  return { message: String(error) };
}

export async function proxyRequest(
  req: Request,
  targetBase: string,
  rewriteCookies = false,
): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `${targetBase}${url.pathname}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.set("accept-encoding", "identity");

  if (rewriteCookies) {
    const cookieHeader = headers.get("cookie");
    if (cookieHeader) {
      const rewrittenCookies = cookieHeader.replace(/\bbetter-auth\./g, "__Secure-better-auth.");
      headers.set("cookie", rewrittenCookies);
    }
  }

  const proxyReq = new Request(targetUrl, {
    method: req.method,
    headers,
    body: req.body,
    duplex: "half",
  } as RequestInit);

  const response = await fetch(proxyReq);

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  if (rewriteCookies) {
    responseHeaders.delete("set-cookie");
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : (response.headers.get("set-cookie")?.split(/,(?=\s*(?:__Secure-|__Host-)?\w+=)/) ?? []);
    for (const cookie of setCookies) {
      const rewritten = cookie
        .replace(/^(__Secure-|__Host-)/i, "")
        .replace(/;\s*Domain=[^;]*/gi, "")
        .replace(/;\s*Secure/gi, "");
      responseHeaders.append("set-cookie", rewritten);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export function setupApiRoutes(
  app: Hono,
  config: RuntimeConfig,
  auth: Auth,
  db: Database,
  plugins: PluginResult,
  loadingState: {
    status: string;
    startTime: number;
    milestones: string[];
    error: Error | null;
    ssrEnabled: boolean;
  },
) {
  const apiConfig = config.api;

  if (!apiConfig) {
    throw new Error("API config is required to start the host");
  }

  const getHealthStatus = () => {
    const elapsed = Date.now() - loadingState.startTime;
    return {
      status: loadingState.status,
      ssr: loadingState.ssrEnabled
        ? loadingState.status === "ready"
          ? "available"
          : "unavailable"
        : "disabled",
      uptime: elapsed,
      milestones: loadingState.milestones,
      ...(loadingState.error ? { error: loadingState.error.message } : {}),
    };
  };

  const isProxyMode = !!apiConfig.proxy;

  if (isProxyMode) {
    const proxyTarget = apiConfig.proxy!;
    logger.info(`[API] Proxy mode enabled → ${proxyTarget}`);

    app.all("/api/*", async (c: Context) => {
      if (c.req.path === "/api/_health") {
        return c.json(getHealthStatus());
      }
      const response = await proxyRequest(c.req.raw, proxyTarget, true);
      return response;
    });

    return;
  }

  app.get("/api/_health", (c: Context) => {
    return c.json(getHealthStatus());
  });

  const handleOrpc = async (
    c: Context,
    handler: RPCHandler<any> | OpenAPIHandler<any>,
    prefix: `/${string}`,
  ) => {
    // Clone early so raw body can be read later even after oRPC consumes the request body.
    const rawClone = c.req.method === "GET" || c.req.method === "HEAD" ? null : c.req.raw.clone();

    const baseContext = await createRequestContext(c.req.raw, auth, db);
    let cachedRawBody: string | null = null;
    const context = {
      ...baseContext,
      getRawBody: async () => {
        if (cachedRawBody !== null) return cachedRawBody;
        if (!rawClone) {
          cachedRawBody = "";
          return cachedRawBody;
        }
        cachedRawBody = await rawClone.text();
        return cachedRawBody;
      },
    };

    const result = await handler.handle(c.req.raw, { prefix, context });
    return result.response
      ? c.newResponse(result.response.body, result.response)
      : c.text("Not Found", 404);
  };

  const mountRouter = (router: unknown, suffix: string, title: string) => {
    const basePath = `/api${suffix}` as const;
    const rpcPath = `/api/rpc${suffix}` as const;
    const rpcHandler = new RPCHandler(router as any, {
      plugins: [new BatchHandlerPlugin()],
      interceptors: [
        onError((error: unknown) => {
          formatORPCError(error);
          throw error;
        }),
      ],
    });

    const apiHandler = new OpenAPIHandler(router as any, {
      plugins: [
        new OpenAPIReferencePlugin({
          schemaConverters: [new ZodToJsonSchemaConverter()],
          specGenerateOptions: {
            info: {
              title,
              version: "1.0.0",
            },
            servers: [{ url: basePath }, { url: `${config.hostUrl}${basePath}` }],
          },
        }),
      ],
      interceptors: [
        onError((error: unknown) => {
          formatORPCError(error);
          throw error;
        }),
      ],
    });

    app.all(rpcPath, (c: Context) => handleOrpc(c, rpcHandler, rpcPath));
    app.all(`${rpcPath}/*`, (c: Context) => handleOrpc(c, rpcHandler, rpcPath));
    app.all(basePath, (c: Context) => handleOrpc(c, apiHandler, basePath));
    app.all(`${basePath}/*`, (c: Context) => handleOrpc(c, apiHandler, basePath));
  };

  app.on(["POST", "GET"], "/api/auth/*", (c: Context) => auth.handler(c.req.raw));

  for (const mount of createRouterMounts(plugins)) {
    mountRouter(mount.router, mount.suffix, mount.title);
  }
}

export const createStartServer = (onReady?: () => void) =>
  Effect.gen(function* () {
    const port = Number(process.env.PORT) || 3000;
    const isDev = process.env.NODE_ENV !== "production";

    if (!process.env.CORS_ORIGIN && !isDev) {
      logger.warn(
        "[Security] CORS_ORIGIN is not set in production. Auth endpoints will reject cross-origin requests.",
      );
      logger.warn(
        "[Security] Set CORS_ORIGIN to your allowed origins (comma-separated), e.g.: CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com",
      );
    }

    const config = yield* ConfigService;
    const uiConfig = config.ui!;
    const db = yield* DatabaseService;
    const auth = yield* AuthService;
    const plugins = yield* PluginsService;

    const app = new Hono();

    app.onError((err: unknown, c: Context) => {
      const details = extractErrorDetails(err);
      logger.error(`[Hono Error] ${c.req.method} ${c.req.path}`);
      logger.error(`[Hono Error] Message: ${details.message}`);
      if (details.cause) {
        logger.error(`[Hono Error] Cause: ${details.cause}`);
      }
      if (details.stack) {
        logger.error(`[Hono Error] Stack:\n${details.stack}`);
      }
      return c.json({ error: details.message, cause: details.cause }, 500);
    });

    app.use(
      "/*",
      cors({
        origin: process.env.CORS_ORIGIN?.split(",").map((o: string) => o.trim()) ?? [
          config.hostUrl,
          ...(uiConfig.url ? [uiConfig.url] : []),
        ],
        credentials: true,
      }),
    );

    app.use("*", secureHeaders());

    app.get("/health", (c: Context) => c.text("OK"));

    let ssrRouterModule: RouterModule | null = null;

    const loadingState = {
      status: "loading" as "loading" | "ready" | "failed",
      startTime: Date.now(),
      milestones: [] as string[],
      error: null as Error | null,
      ssrEnabled: Boolean(uiConfig.ssrUrl),
    };

    const renderClientShell = (
      ctx: Context,
      runtimeConfig: ClientRuntimeConfig,
      error?: Error | null,
    ) => {
      const clientUrl = uiConfig.url;
      const uiIntegrity = uiConfig.integrity;
      const themeInitScript = (getThemeInitScript() as { children?: string }).children ?? "";
      const hydrateScript =
        (getHydrateScript(runtimeConfig as ClientRuntimeConfig) as { children?: string })
          .children ?? "";

      const sriAttr = uiIntegrity ? ` integrity="${uiIntegrity}" crossorigin="anonymous"` : "";

      return ctx.html(
        `<!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
              <title>${config.domain || "App"}</title>
              <link rel="icon" type="image/x-icon" href="${clientUrl}/favicon.ico" />
              <link rel="icon" type="image/svg+xml" href="${clientUrl}/icon.svg" />
              <link rel="manifest" href="${clientUrl}/manifest.json" />
              <style>
                ${getBaseStyles()}
                .shell { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; }
                .fade { animation: fadeIn 0.3s ease-in; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .error { color: #fca5a5; }
              </style>
              <script src="${clientUrl}/remoteEntry.js"${sriAttr}></script>
              <script>${themeInitScript}</script>
              <script>${hydrateScript}</script>
            </head>
            <body>
              <div id="root">
                <div class="shell">
                  <div class="fade">
                    ${
                      error
                        ? `<p class="error">SSR unavailable, showing client app.</p><p>${error.message}</p>`
                        : `<p>Loading...</p>`
                    }
                  </div>
                </div>
              </div>
            </body>
          </html>`,
        200,
      );
    };

    const logMilestone = (name: string) => {
      const elapsed = Date.now() - loadingState.startTime;
      const message = `[SSR] [+${elapsed}ms] ${name}`;
      loadingState.milestones.push(message);
    };

    const proxyUiAssetRequest = (c: Context) => proxyRequest(c.req.raw, uiConfig.url);
    const staticAssetPaths = [
      "/static/*",
      "/.well-known/*",
      "/favicon.ico",
      "/icon.svg",
      "/manifest.json",
      "/robots.txt",
      "/README.md",
      "/skill.md",
      "/llms.txt",
    ];

    setupApiRoutes(app, config, auth, db, plugins, loadingState);

    const shouldProxyUiAssets = isDev || uiConfig.source === "remote";

    if (!shouldProxyUiAssets) {
      for (const path of staticAssetPaths) {
        app.use(path, serveStatic({ root: "./dist" }));
      }
    } else {
      registerAllPaths(app, staticAssetPaths, proxyUiAssetRequest);
    }

    if (uiConfig.ssrUrl) {
      const routerModuleResult = yield* loadRouterModule(config).pipe(Effect.either);

      if (routerModuleResult._tag === "Left") {
        loadingState.status = "failed";
        loadingState.error = routerModuleResult.left;
        logMilestone("Load failed");
        logger.error("[SSR] Failed to load Router module:", routerModuleResult.left);
        yield* Effect.fail(routerModuleResult.left);
      } else {
        ssrRouterModule = routerModuleResult.right;
        loadingState.status = "ready";
      }
    } else {
      loadingState.status = "ready";
    }

    app.get("*", async (c: Context) => {
      const activeRuntime = await resolveActiveRuntime(config, c.req.raw);

      const runtimeConfig = buildRuntimeClientConfig(config, c.req.raw, activeRuntime);

      if (!uiConfig.ssrUrl) {
        return renderClientShell(c, runtimeConfig);
      }

      if (!ssrRouterModule) {
        return c.text("SSR router unavailable", 503);
      }

      try {
        const assetsUrl = uiConfig.url;

        const requestContext = await createRequestContext(c.req.raw, auth, db);
        const ssrApiClient = createPluginsClient(plugins, requestContext);

        const render = () =>
          ssrRouterModule?.renderToStream(c.req.raw, {
            assetsUrl,
            session: requestContext.session,
            basepath: runtimeConfig.runtime?.runtimeBasePath,
            runtimeConfig,
            apiClient: ssrApiClient,
          } as any);

        const result = await render();
        return new Response(result?.stream, {
          status: result?.statusCode,
          headers: result?.headers,
        });
      } catch (error) {
        logger.error("[SSR] Streaming error:", error);
        return c.html(
          `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Server Error</title>
            <style>
              body { font-family: system-ui; padding: 2rem; background: #1c1c1e; color: #fafafa; }
              pre { background: #2d2d2d; padding: 1rem; border-radius: 8px; overflow-x: auto; }
            </style>
          </head>
          <body>
            <h1>Server Error</h1>
            <p>An error occurred during server-side rendering.</p>
            <pre>${error instanceof Error ? error.stack : String(error)}</pre>
          </body>
        </html>
      `,
          500,
        );
      }
    });

    const startHttpServer = () => {
      const hostname = process.env.HOST || "0.0.0.0";

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

      const server = serve({ fetch: proxiedFetch, port, hostname }, () => {
        onReady?.();
      });
      return server;
    };

    const httpServer = startHttpServer();

    yield* Effect.addFinalizer(() =>
      Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            logger.info("[Server] Closing HTTP server...");
            httpServer.close(() => {
              logger.info("[Server] HTTP server closed");
              resolve();
            });
          }),
      ),
    );

    yield* Effect.never;
  });

export interface ServerInput {
  config: RuntimeConfig;
}

export interface ServerHandle {
  ready: Promise<void>;
  shutdown: () => Promise<void>;
}

export const runServer = (input: ServerInput): ServerHandle => {
  const ConfigLive = Layer.succeed(ConfigService, input.config);
  const ServerLive = Layer.provideMerge(Layer.mergeAll(BaseLive, PluginsLive), ConfigLive);

  const runtime = ManagedRuntime.make(ServerLive);
  let serverFiber: Fiber.RuntimeFiber<void, any> | null = null;

  const program = Effect.gen(function* () {
    const readyDeferred = yield* Deferred.make<void>();

    const fiber = yield* Effect.forkDaemon(
      Effect.scoped(createStartServer(() => Deferred.unsafeDone(readyDeferred, Exit.void))),
    );

    serverFiber = fiber;

    yield* Deferred.await(readyDeferred);
  });

  const ready = runtime.runPromise(program);

  const shutdown = async () => {
    logger.info("[Server] Shutting down...");

    if (serverFiber) {
      await Effect.runPromise(
        Fiber.interrupt(serverFiber).pipe(
          Effect.timeout("3 seconds"),
          Effect.catchAll(() => Effect.void),
        ),
      );
    }

    await runtime.dispose();
    logger.info("[Server] Shutdown complete");
  };

  return { ready, shutdown };
};

export const runServerBlocking = async (input: ServerInput) => {
  const handle = runServer(input);

  const forceExit = () => {
    console.log("\n[Server] Force exit");
    process.exit(0);
  };

  const gracefulShutdown = () => {
    const timeout = setTimeout(forceExit, 5000);
    handle
      .shutdown()
      .then(() => {
        clearTimeout(timeout);
        process.exit(0);
      })
      .catch(() => {
        clearTimeout(timeout);
        process.exit(1);
      });
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  try {
    await handle.ready;
    await new Promise(() => {});
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};
