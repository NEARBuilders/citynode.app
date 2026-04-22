import { createPluginRuntime } from "every-plugin";
import { Context, Effect, Layer } from "every-plugin/effect";
import { verifySriForUrl } from "everything-dev/integrity";
import type { RuntimeConfig } from "everything-dev/types";
import { ConfigService } from "./config";
import { PluginError } from "./errors";

export interface LoadedPlugin {
  key: string;
  name: string;
  createClient: (ctx?: unknown) => unknown;
  router: unknown;
  metadata: {
    remoteUrl: string;
    version?: string;
  };
}

export interface PluginStatus {
  available: boolean;
  pluginName: string | null;
  error: string | null;
  errorDetails: string | null;
  loadedPlugins: string[];
}

export interface PluginResult {
  runtime: ReturnType<typeof createPluginRuntime> | null;
  api: LoadedPlugin | null;
  plugins: Record<string, LoadedPlugin>;
  status: PluginStatus;
}

function secretsFromEnv(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

const unavailableResult = (
  pluginName: string | null,
  error: string | null,
  errorDetails: string | null,
  loadedPlugins: string[] = [],
): PluginResult => ({
  runtime: null,
  api: null,
  plugins: {},
  status: { available: false, pluginName, error, errorDetails, loadedPlugins },
});

type RuntimePluginInput = NonNullable<RuntimeConfig["plugins"]>[string];

interface RuntimePluginEntry {
  key: string;
  runtimeId: string;
  config: RuntimeConfig["api"] | RuntimePluginInput;
}

function buildRegistryEntries(config: RuntimeConfig): RuntimePluginEntry[] {
  const entries: RuntimePluginEntry[] = [];
  if (config.api?.url) {
    entries.push({ key: "api", runtimeId: config.api.name, config: config.api });
  }
  for (const [key, plugin] of Object.entries(config.plugins ?? {})) {
    if (plugin.url) {
      entries.push({ key, runtimeId: plugin.name, config: plugin });
    }
  }
  return entries;
}

function collectSecrets(config: { secrets?: string[] }): Record<string, string> {
  return secretsFromEnv(config.secrets ?? []);
}

export const initializePlugins = Effect.gen(function* () {
  const config: RuntimeConfig = yield* ConfigService;

  if (config.api.proxy) {
    console.log(`[Plugins] Proxy mode enabled, skipping plugin initialization`);
    console.log(`[Plugins] API requests will be proxied to: ${config.api.proxy}`);
    return {
      runtime: null,
      api: null,
      plugins: {},
      status: {
        available: false,
        pluginName: config.api.name,
        error: null,
        errorDetails: null,
        loadedPlugins: [],
      },
    } satisfies PluginResult;
  }

  const registryEntries = buildRegistryEntries(config);
  if (registryEntries.length === 0) {
    console.log("[Plugins] No remote plugins configured, using host API only");
    return unavailableResult(config.api.name, null, null);
  }

  console.log(`[Plugins] Registering ${registryEntries.length} plugin(s)`);

  const result = yield* Effect.tryPromise({
    try: async () => {
      const runtime = createPluginRuntime({
        registry: Object.fromEntries(
          registryEntries.map((entry) => [entry.runtimeId, { remote: entry.config.url }]),
        ),
        secrets: {},
      });

      // Phase 1: Load all non-API plugins first
      const pluginEntries = registryEntries.filter((e) => e.key !== "api");
      const apiEntry = registryEntries.find((e) => e.key === "api");

      const pluginResults = await Promise.allSettled(
        pluginEntries.map(async (entry) => {
          if (entry.config.integrity) {
            await verifySriForUrl(entry.config.url, entry.config.integrity);
          }

          const variables: Record<string, unknown> = {
            ...entry.config.variables,
          };

          const plugin = await runtime.usePlugin(entry.runtimeId as never, {
            // @ts-expect-error dynamic runtime config
            variables,
            // @ts-expect-error dynamic runtime config
            secrets: collectSecrets(entry.config),
          });

          return {
            key: entry.key,
            name: entry.config.name,
            createClient: plugin.createClient as unknown as (ctx?: unknown) => unknown,
            router: plugin.router,
            metadata: {
              remoteUrl: entry.config.url,
              version: plugin.metadata.version,
            },
          } satisfies LoadedPlugin;
        }),
      );

      // Build plugins client map from Phase 1 results
      const loadedPlugins: Record<string, LoadedPlugin> = {};
      const loadedPluginKeys: string[] = [];
      const pluginsClient: Record<string, unknown> = {};
      const errors: string[] = [];

      pluginResults.forEach((result, index) => {
        const entry = pluginEntries[index];
        const key = entry?.key ?? "unknown";
        if (result.status === "fulfilled") {
          loadedPlugins[key] = result.value;
          loadedPluginKeys.push(key);
          pluginsClient[key] = result.value.createClient;
        } else {
          errors.push(
            result.reason instanceof Error ? result.reason.message : String(result.reason),
          );
        }
      });

      // Phase 2: Load the API plugin with injected plugins client
      let baseApi: LoadedPlugin | null = null;

      if (apiEntry) {
        try {
          if (apiEntry.config.integrity) {
            await verifySriForUrl(apiEntry.config.url, apiEntry.config.integrity);
          }

          const apiVariables: Record<string, unknown> = {
            ...apiEntry.config.variables,
          };

          const apiPlugin = await runtime.usePlugin(
            apiEntry.runtimeId as never,
            {
              // @ts-expect-error dynamic runtime config
              variables: apiVariables,
              // @ts-expect-error dynamic runtime config
              secrets: collectSecrets(apiEntry.config),
            },
            pluginsClient,
          );

          baseApi = {
            key: "api",
            name: apiEntry.config.name,
            createClient: apiPlugin.createClient as unknown as (ctx?: unknown) => unknown,
            router: apiPlugin.router,
            metadata: {
              remoteUrl: apiEntry.config.url,
              version: apiPlugin.metadata.version,
            },
          } satisfies LoadedPlugin;

          loadedPlugins.api = baseApi;
          loadedPluginKeys.unshift("api");
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      return {
        runtime,
        api: baseApi,
        plugins: loadedPlugins,
        status: {
          available: Boolean(baseApi),
          pluginName: config.api.name,
          error: errors.length > 0 ? errors.join("; ") : null,
          errorDetails: errors.length > 0 ? errors.join("\n") : null,
          loadedPlugins: loadedPluginKeys,
        },
      } satisfies PluginResult;
    },
    catch: (error) =>
      new PluginError({
        pluginName: config.api.name,
        pluginUrl: config.api.url,
        cause: error,
      }),
  });

  return result;
}).pipe(
  Effect.catchAll((error) => {
    const pluginName = error instanceof PluginError ? error.pluginName : null;
    const pluginUrl = error instanceof PluginError ? error.pluginUrl : null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[Plugins] ❌ Failed to initialize plugin");
    console.error(`[Plugins] Plugin: ${pluginName}`);
    console.error(`[Plugins] URL: ${pluginUrl}`);
    console.error(`[Plugins] Error: ${errorMessage}`);
    console.warn("[Plugins] Server will continue without plugin functionality");

    return Effect.succeed(unavailableResult(pluginName ?? null, errorMessage, errorStack ?? null));
  }),
);

export class PluginsService extends Context.Tag("host/PluginsService")<
  PluginsService,
  PluginResult
>() {
  static Live = Layer.scoped(
    PluginsService,
    Effect.gen(function* () {
      const plugins = yield* initializePlugins;

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (plugins.runtime) {
            console.log("[Plugins] Shutting down plugin runtime...");
            plugins.runtime.shutdown();
          }
        }),
      );

      return plugins;
    }),
  );
}

export function createPluginsClient(result: PluginResult, context?: unknown): unknown {
  const client: Record<string, unknown> = {};

  if (result.api?.createClient) {
    Object.assign(client, result.api.createClient(context) as Record<string, unknown>);
  }

  for (const [key, plugin] of Object.entries(result.plugins)) {
    if (key === "api") continue;
    client[key] = plugin.createClient(context);
  }

  return client;
}
