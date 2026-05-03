import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { Effect } from "effect";
import {
  getProjectRoot,
  isLocalDevelopmentTarget,
  parsePort,
  resolveLocalDevelopmentPath,
} from "./config";
import { getNetworkIdForAccount } from "./network";
import { makeDevProcess, type ProcessCallbacks, type ProcessHandle } from "./orchestrator";
import type { ProcessRegistry } from "./process-registry";
import type { BosConfig, RuntimeConfig, RuntimePluginConfig } from "./types";

export interface AppOrchestrator {
  packages: string[];
  env: Record<string, string>;
  description: string;
  bosConfig: BosConfig;
  runtimeConfig: RuntimeConfig;
  port?: number;
  interactive?: boolean;
}

const STARTUP_ORDER = ["ui-ssr", "ui", "api", "plugin", "host-build", "host"];
const DEFAULT_HOST_PORT = 3000;
const DEFAULT_UI_PORT = 3002;
const DEFAULT_API_PORT = 3014;
const DEFAULT_PLUGIN_PORT_START = 3021;

const sortByOrder = (packages: string[]): string[] => {
  return [...packages].sort((a, b) => {
    const aIdx = a.startsWith("plugin:")
      ? STARTUP_ORDER.indexOf("plugin")
      : STARTUP_ORDER.indexOf(a);
    const bIdx = b.startsWith("plugin:")
      ? STARTUP_ORDER.indexOf("plugin")
      : STARTUP_ORDER.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
};

// Note: log filtering and persistence lives at the CLI layer.

export interface DevServersHandle {
  handles: ProcessHandle[];
  shutdown: Effect.Effect<void>;
}

export const startDevServers = (
  orchestrator: AppOrchestrator,
  callbacks: ProcessCallbacks,
  registry?: ProcessRegistry,
) => {
  const run = Effect.gen(function* () {
    const orderedPackages = sortByOrder(orchestrator.packages);
    const handles: ProcessHandle[] = [];

    const startProcess = (pkg: string) => {
      const portOverride = pkg === "host" ? orchestrator.port : undefined;
      return makeDevProcess(
        pkg,
        orchestrator.env,
        callbacks,
        portOverride,
        orchestrator.bosConfig,
        orchestrator.runtimeConfig,
        registry,
      );
    };

    const startGroup = (packages: string[]) =>
      Effect.forEach(packages, startProcess, { concurrency: "unbounded" });

    const awaitReady = (pkg: string, handle: ProcessHandle) =>
      Effect.race(
        handle.waitForReady,
        Effect.sleep("30 seconds").pipe(
          Effect.andThen(
            Effect.sync(() => {
              callbacks.onLog(pkg, "Timeout waiting for ready, continuing...", true);
            }),
          ),
        ),
      );

    const nonHostPackages = orderedPackages.filter((pkg) => pkg !== "host");
    const hostPackages = orderedPackages.filter((pkg) => pkg === "host");

    const nonHostHandles = yield* startGroup(nonHostPackages);
    handles.push(...nonHostHandles);

    yield* Effect.forEach(
      nonHostHandles.map((handle, index) => ({
        handle,
        pkg: nonHostPackages[index] ?? handle.name,
      })),
      ({ handle, pkg }) => awaitReady(pkg, handle),
      { concurrency: "unbounded" },
    );

    const hostHandles = yield* startGroup(hostPackages);
    handles.push(...hostHandles);

    yield* Effect.forEach(
      hostHandles.map((handle, index) => ({ handle, pkg: hostPackages[index] ?? handle.name })),
      ({ handle, pkg }) => awaitReady(pkg, handle),
      { concurrency: "unbounded" },
    );

    const shutdown = Effect.gen(function* () {
      const reversed = [...handles].reverse();
      for (const handle of reversed) {
        yield* handle.kill.pipe(Effect.ignore);
      }
    });

    return { handles, shutdown } satisfies DevServersHandle;
  });

  return run;
};

export function detectLocalPackages(
  bosConfig?: BosConfig,
  runtimeConfig?: RuntimeConfig,
): string[] {
  const packages: string[] = [];
  const configDir = getProjectRoot();

  const uiLocalPath =
    runtimeConfig?.ui.localPath ??
    resolveLocalDevelopmentPath(bosConfig?.app.ui.development, configDir);
  if (uiLocalPath && existsSync(join(uiLocalPath, "package.json"))) {
    packages.push("ui");
  }

  const apiLocalPath =
    runtimeConfig?.api.localPath ??
    resolveLocalDevelopmentPath(bosConfig?.app.api.development, configDir);
  if (apiLocalPath && existsSync(join(apiLocalPath, "package.json"))) {
    packages.push("api");
  }

  const hostLocalPath = resolveLocalDevelopmentPath(bosConfig?.app.host.development, configDir);
  if (hostLocalPath && existsSync(join(hostLocalPath, "package.json"))) {
    packages.push("host");
  } else if (existsSync(join(configDir, "host", "package.json"))) {
    packages.push("host");
  }

  for (const [pluginId, pluginConfig] of Object.entries(runtimeConfig?.plugins ?? {})) {
    if (pluginConfig.localPath && existsSync(join(pluginConfig.localPath, "package.json"))) {
      packages.push(`plugin:${pluginId}`);
    }
  }

  return packages;
}

export function buildRuntimeConfig(
  bosConfig: BosConfig,
  options: {
    uiSource?: "local" | "remote";
    apiSource?: "local" | "remote";
    hostUrl: string;
    proxy?: string;
    env?: "development" | "production";
    plugins?: Record<string, RuntimePluginConfig>;
  },
): RuntimeConfig {
  const configDir = getProjectRoot();
  const uiConfig = bosConfig.app.ui;
  const apiConfig = bosConfig.app.api;
  const uiSource = options.uiSource ?? "local";
  const apiSource = options.apiSource ?? "local";
  const uiLocalPath = resolveLocalDevelopmentPath(uiConfig.development, configDir);
  const apiLocalPath = resolveLocalDevelopmentPath(apiConfig.development, configDir);
  const uiLocalUrl =
    !uiLocalPath && uiConfig.development && !isLocalDevelopmentTarget(uiConfig.development)
      ? uiConfig.development
      : "";
  const apiLocalUrl =
    !apiLocalPath && apiConfig.development && !isLocalDevelopmentTarget(apiConfig.development)
      ? apiConfig.development
      : "";

  return {
    env: options.env ?? "development",
    account: bosConfig.account,
    domain: bosConfig.domain,
    networkId: getNetworkIdForAccount(bosConfig.account),
    hostUrl: options.hostUrl,
    shared: bosConfig.shared,
    ui: uiConfig
      ? {
          name: uiConfig.name,
          url: uiSource === "remote" ? (uiConfig.production ?? "") : uiLocalUrl,
          entry:
            uiSource === "remote"
              ? `${uiConfig.production ?? ""}/mf-manifest.json`
              : uiLocalUrl
                ? `${uiLocalUrl}/mf-manifest.json`
                : "/mf-manifest.json",
          localPath: uiSource === "local" ? (uiLocalPath ?? undefined) : undefined,
          port: uiSource === "local" && uiLocalUrl ? parsePort(uiLocalUrl) : undefined,
          ssrUrl: uiSource === "remote" ? uiConfig.ssr : undefined,
          ssrIntegrity: uiSource === "remote" ? uiConfig.ssrIntegrity : undefined,
          integrity: uiSource === "remote" ? uiConfig.productionIntegrity : undefined,
          source: uiSource === "local" ? (uiLocalPath ? "local" : "remote") : "remote",
        }
      : {
          name: "ui",
          url: "",
          entry: "/mf-manifest.json",
          source: uiSource,
        },
    api: apiConfig
      ? {
          name: apiConfig.name,
          url: apiSource === "remote" ? (apiConfig.production ?? "") : apiLocalUrl,
          entry:
            apiSource === "remote"
              ? `${apiConfig.production ?? ""}/mf-manifest.json`
              : apiLocalUrl
                ? `${apiLocalUrl}/mf-manifest.json`
                : "/mf-manifest.json",
          localPath: apiSource === "local" ? (apiLocalPath ?? undefined) : undefined,
          port: apiSource === "local" && apiLocalUrl ? parsePort(apiLocalUrl) : undefined,
          source: apiSource === "local" ? (apiLocalPath ? "local" : "remote") : "remote",
          proxy: options.proxy ?? apiConfig.proxy,
          variables: apiConfig.variables,
          secrets: apiConfig.secrets,
          integrity: apiSource === "remote" ? apiConfig.productionIntegrity : undefined,
        }
      : {
          name: "api",
          url: "",
          entry: "/mf-manifest.json",
          source: apiSource,
        },
    plugins: options.plugins,
  };
}

function probeTcpOpen(port: number, timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function pickAvailablePort(preferred: number, usedPorts: Set<number>): Promise<number> {
  let port = preferred;
  while (usedPorts.has(port) || (await probeTcpOpen(port))) {
    port += 1;
  }
  usedPorts.add(port);
  return port;
}

function withLocalRuntimeUrl<
  T extends { url: string; entry: string; port?: number; localPath?: string },
>(entry: T, port: number): T {
  const url = `http://localhost:${port}`;
  return {
    ...entry,
    url,
    entry: `${url}/mf-manifest.json`,
    port,
  };
}

export async function prepareDevelopmentRuntimeConfig(
  runtimeConfig: RuntimeConfig,
  options?: { hostPort?: number; ssr?: boolean },
): Promise<RuntimeConfig> {
  const usedPorts = new Set<number>();
  const hostPort = await pickAvailablePort(
    options?.hostPort ??
      (runtimeConfig.hostUrl ? parsePort(runtimeConfig.hostUrl) : DEFAULT_HOST_PORT),
    usedPorts,
  );

  const next: RuntimeConfig = {
    ...runtimeConfig,
    hostUrl: `http://localhost:${hostPort}`,
    ui: { ...runtimeConfig.ui },
    api: { ...runtimeConfig.api },
    plugins: runtimeConfig.plugins ? { ...runtimeConfig.plugins } : undefined,
  };

  if (next.ui.source === "local" && next.ui.localPath) {
    const uiPort = await pickAvailablePort(next.ui.port ?? DEFAULT_UI_PORT, usedPorts);
    next.ui = withLocalRuntimeUrl(next.ui, uiPort);
    if (options?.ssr) {
      const ssrPort = await pickAvailablePort(uiPort + 1, usedPorts);
      next.ui.ssrUrl = `http://localhost:${ssrPort}`;
    } else {
      next.ui.ssrUrl = undefined;
    }
  }

  if (next.api.source === "local" && next.api.localPath) {
    const apiPort = await pickAvailablePort(next.api.port ?? DEFAULT_API_PORT, usedPorts);
    next.api = withLocalRuntimeUrl(next.api, apiPort);
  }

  if (next.plugins) {
    const entries = Object.entries(next.plugins).sort(([a], [b]) => a.localeCompare(b));
    let pluginBasePort = DEFAULT_PLUGIN_PORT_START;

    for (const [pluginId, plugin] of entries) {
      if (plugin.source !== "local" || !plugin.localPath) {
        continue;
      }

      const pluginPort = await pickAvailablePort(plugin.port ?? pluginBasePort, usedPorts);
      next.plugins[pluginId] = withLocalRuntimeUrl(plugin, pluginPort);
      pluginBasePort = pluginPort + 1;
    }
  }

  return next;
}
