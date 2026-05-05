import { createPluginRuntime } from "every-plugin";
import { Context, Effect, Layer } from "every-plugin/effect";
import { verifySriForUrl } from "everything-dev/integrity";
import type { RuntimeConfig } from "everything-dev/types";
import { ConfigService } from "./config";
import { PluginError } from "./errors";

export interface InitializedPluginResult {
  context: unknown;
  [key: string]: unknown;
}

export interface HostPluginEntry {
  key: string;
  name: string;
  createClient: (context?: unknown) => unknown;
  router: unknown;
  metadata: { remoteUrl: string; version?: string };
  initialized?: InitializedPluginResult;
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
  auth: HostPluginEntry | null;
  api: HostPluginEntry | null;
  plugins: Record<string, HostPluginEntry>;
  authClient: ((ctx?: unknown) => unknown) | null;
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
  auth: null,
  api: null,
  plugins: {},
  authClient: null,
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

async function loadPluginEntry(
  runtime: any,
  entry: RuntimePluginEntry,
  pluginsClient?: Record<string, unknown>,
): Promise<HostPluginEntry> {
  if (entry.config.integrity) {
    await verifySriForUrl(entry.config.url, entry.config.integrity);
  }

  const variables: Record<string, unknown> = { ...entry.config.variables };
  const args: [unknown, unknown?] = [{ variables, secrets: collectSecrets(entry.config) }];
  if (pluginsClient) args.push(pluginsClient);

  const result = await runtime.usePlugin(entry.runtimeId, ...args);

  return { key: entry.key, name: entry.config.name, ...result };
}

export const initializePlugins = Effect.gen(function* () {
  const config: RuntimeConfig = yield* ConfigService;

  if (config.api.proxy) {
    console.log(`[Plugins] Proxy mode enabled, skipping plugin initialization`);
    console.log(`[Plugins] API requests will be proxied to: ${config.api.proxy}`);
    return {
      runtime: null,
      auth: null,
      api: null,
      plugins: {},
      authClient: null,
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
  if (registryEntries.length === 0 && !config.auth) {
    console.log("[Plugins] No remote plugins configured, using host API only");
    return unavailableResult(config.api.name, null, null);
  }

  console.log(`[Plugins] Registering ${registryEntries.length} plugin(s)`);

  const result = yield* Effect.tryPromise({
    try: async () => {
      const allEntries: RuntimePluginEntry[] = [];

      if (config.auth?.url) {
        allEntries.push({ key: "auth", runtimeId: config.auth.name, config: config.auth });
      }

      allEntries.push(...registryEntries);

      const runtime = createPluginRuntime({
        registry: Object.fromEntries(
          allEntries.map((entry) => [entry.runtimeId, { remote: entry.config.url }]),
        ),
        secrets: {},
      });

      // Phase 0: Load auth plugin (app-level infrastructure)
      let authPlugin: HostPluginEntry | null = null;
      let authClient: ((ctx?: unknown) => unknown) | null = null;
      if (config.auth?.url) {
        const authEntry: RuntimePluginEntry = {
          key: "auth",
          runtimeId: config.auth.name,
          config: config.auth,
        };
        try {
          authPlugin = await loadPluginEntry(runtime, authEntry);
          authClient = authPlugin.createClient;
          console.log(`[Plugins] Auth plugin loaded: ${authPlugin.name}`);
        } catch (error) {
          console.error(
            `[Plugins] Failed to load auth plugin: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Phase 1: Load all non-API plugins
      const pluginEntries = registryEntries.filter((e) => e.key !== "api");

      const pluginResults = await Promise.allSettled(
        pluginEntries.map((entry) => loadPluginEntry(runtime, entry)),
      );

      const loadedPlugins: Record<string, HostPluginEntry> = {};
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
          const msg =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push(msg);
          pluginsClient[key] = () => {
            throw new Error(`Plugin "${key}" failed to load: ${msg}`);
          };
        }
      });

      // Phase 2: Load the API plugin with pluginsClient + authClient
      let baseApi: HostPluginEntry | null = null;
      const apiEntry = registryEntries.find((e) => e.key === "api");

      if (apiEntry) {
        try {
          const apiPluginsClient: Record<string, unknown> = { ...pluginsClient };
          if (authClient) {
            apiPluginsClient.auth = authClient;
          }

          baseApi = await loadPluginEntry(runtime, apiEntry, apiPluginsClient);
          loadedPlugins.api = baseApi;
          loadedPluginKeys.unshift("api");
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      return {
        runtime,
        auth: authPlugin,
        api: baseApi,
        plugins: loadedPlugins,
        authClient,
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
        Effect.promise(async () => {
          if (plugins.runtime) {
            console.log("[Plugins] Shutting down plugin runtime...");
            await plugins.runtime.shutdown();
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

  if (result.authClient) {
    client.auth = result.authClient(context);
  }

  return client;
}
