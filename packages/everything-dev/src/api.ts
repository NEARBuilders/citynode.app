import { verifySriForUrl } from "./integrity";
import { ensureNodeRuntimePlugin, registerRemote } from "./mf";
import { createPluginRuntime } from "./sdk";
import type { RuntimeConfig, RuntimePluginConfig } from "./types";

export interface LoadedPluginResult {
  key: string;
  name: string;
  router: any;
  createClient: (context?: unknown) => any;
  metadata: {
    remoteUrl: string;
    version?: string;
  };
}

export interface LoadedPluginsResult {
  base: LoadedPluginResult | null;
  plugins: LoadedPluginResult[];
  errors: Array<{ key: string; error: string }>;
}

export async function loadApiPlugin(opts: {
  key: string;
  runtimeId: string;
  name: string;
  entry: string;
  variables?: Record<string, string>;
  secrets?: Record<string, string>;
  integrity?: string;
  plugins?: Record<string, unknown>;
}): Promise<LoadedPluginResult> {
  const remoteEntryUrl = (() => {
    if (opts.entry.endsWith("/remoteEntry.js")) return opts.entry;
    if (opts.entry.endsWith("/mf-manifest.json")) {
      return `${opts.entry.replace(/\/mf-manifest\.json$/, "")}/remoteEntry.js`;
    }
    if (opts.entry.endsWith(".js")) return opts.entry;
    return `${opts.entry.replace(/\/$/, "")}/remoteEntry.js`;
  })();

  if (opts.integrity) {
    await verifySriForUrl(remoteEntryUrl, opts.integrity);
  }

  await ensureNodeRuntimePlugin();
  await registerRemote({ name: opts.runtimeId, entry: remoteEntryUrl });

  const runtime: any = createPluginRuntime({
    registry: {
      [opts.runtimeId]: { remote: remoteEntryUrl },
    },
    secrets: opts.secrets ?? {},
  });

  // biome-ignore lint/correctness/useHookAtTopLevel: usePlugin is not a React hook
  const plugin = await runtime.usePlugin(
    opts.runtimeId,
    {
      variables: opts.variables ?? {},
      secrets: opts.secrets ?? {},
    },
    opts.plugins,
  );

  return {
    key: opts.key,
    name: opts.name,
    router: plugin.router,
    createClient: plugin.createClient as (context?: unknown) => any,
    metadata: {
      remoteUrl: remoteEntryUrl,
      version: plugin.metadata.version,
    },
  };
}

function collectSecrets(config: RuntimePluginConfig, envSecrets?: Record<string, string>) {
  const secrets: Record<string, string> = {};
  for (const key of config.secrets ?? []) {
    const value = envSecrets?.[key] ?? process.env[key];
    if (value) {
      secrets[key] = value;
    }
  }
  return secrets;
}

export async function loadApiPluginsFromRuntimeConfig(
  runtimeConfig: RuntimeConfig,
  envSecrets?: Record<string, string>,
): Promise<LoadedPluginsResult> {
  const entries: Array<[string, RuntimePluginConfig]> = [];

  if (runtimeConfig.api?.url) {
    entries.push(["api", runtimeConfig.api]);
  }

  for (const [key, plugin] of Object.entries(runtimeConfig.plugins ?? {})) {
    if (plugin.url) {
      entries.push([key, plugin]);
    }
  }

  if (entries.length === 0) {
    console.log("[API] No plugins configured");
    return { base: null, plugins: [], errors: [] };
  }

  // Phase 1: Load non-API plugins first
  const pluginEntries = entries.filter(([key]) => key !== "api");
  const apiEntry = entries.find(([key]) => key === "api");

  const pluginResults = await Promise.allSettled(
    pluginEntries.map(async ([key, pluginConfig]) => {
      console.log(`[API] Loading plugin: ${pluginConfig.name} from ${pluginConfig.entry}`);
      return loadApiPlugin({
        key,
        runtimeId: pluginConfig.name,
        name: pluginConfig.name,
        entry: pluginConfig.entry,
        variables: pluginConfig.variables,
        secrets: collectSecrets(pluginConfig, envSecrets),
        integrity: pluginConfig.integrity,
      });
    }),
  );

  const plugins: LoadedPluginResult[] = [];
  const errors: Array<{ key: string; error: string }> = [];

  const pluginsClient: Record<string, unknown> = {};

  pluginResults.forEach((result, index) => {
    const [key] = pluginEntries[index] ?? ["unknown"];
    if (result.status === "fulfilled") {
      plugins.push(result.value);
      pluginsClient[key] = result.value.createClient;
    } else {
      errors.push({
        key,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  // Phase 2: Load API plugin with injected plugins client
  let base: LoadedPluginResult | null = null;

  if (apiEntry) {
    const [key, apiConfig] = apiEntry;
    try {
      console.log(`[API] Loading API plugin: ${apiConfig.name} from ${apiConfig.entry}`);
      base = await loadApiPlugin({
        key,
        runtimeId: apiConfig.name,
        name: apiConfig.name,
        entry: apiConfig.entry,
        variables: apiConfig.variables,
        secrets: collectSecrets(apiConfig, envSecrets),
        integrity: apiConfig.integrity,
        plugins: pluginsClient,
      });
    } catch (error) {
      errors.push({
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { base, plugins, errors };
}

export function createStitchedRouter(baseRouter: any, plugins: LoadedPluginResult[] | null): any {
  if (!plugins || plugins.length === 0) {
    return baseRouter;
  }

  return plugins.reduce((router, plugin) => Object.assign(router, plugin.router), baseRouter);
}
