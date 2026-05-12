import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import {
  buildRuntimeConfig as configBuildRuntimeConfig,
  getProjectRoot,
  resolveLocalDevelopmentPath,
} from "./config";
import type { AppOrchestrator } from "./service-descriptor";
import type { BosConfig, RuntimeConfig, RuntimePluginConfig } from "./types";

export type { AppOrchestrator };

const DEFAULT_HOST_PORT = 3000;
const DEFAULT_API_PORT = 3001;
const DEFAULT_AUTH_PORT = 3002;
const DEFAULT_UI_PORT = 3003;
const DEFAULT_PLUGIN_PORT_START = 3010;

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

  const hostLocalPath =
    runtimeConfig?.host?.localPath ??
    resolveLocalDevelopmentPath(bosConfig?.app.host.development, configDir);
  if (hostLocalPath && existsSync(join(hostLocalPath, "package.json"))) {
    packages.push("host");
  } else if (existsSync(join(configDir, "host", "package.json"))) {
    packages.push("host");
  }

  for (const [pluginId, pluginConfig] of Object.entries(runtimeConfig?.plugins ?? {})) {
    if (pluginConfig.localPath && existsSync(join(pluginConfig.localPath, "package.json"))) {
      packages.push(`plugin:${pluginId}`);
    }
    if (pluginConfig.ui?.localPath && existsSync(join(pluginConfig.ui.localPath, "package.json"))) {
      packages.push(`plugin-ui:${pluginId}`);
    }
  }

  const authLocalPath =
    runtimeConfig?.auth?.localPath ??
    resolveLocalDevelopmentPath(bosConfig?.app.auth?.development, configDir);
  if (authLocalPath && existsSync(join(authLocalPath, "package.json"))) {
    packages.push("auth");
  }

  return packages;
}

export function buildRuntimeConfig(
  bosConfig: BosConfig,
  options: {
    hostSource?: "local" | "remote";
    uiSource?: "local" | "remote";
    apiSource?: "local" | "remote";
    authSource?: "local" | "remote";
    proxy?: string;
    env?: "development" | "production";
    plugins?: Record<string, RuntimePluginConfig>;
  },
): RuntimeConfig {
  return configBuildRuntimeConfig(bosConfig, getProjectRoot(), options.env ?? "development", {
    hostSource: options.hostSource,
    uiSource: options.uiSource,
    apiSource: options.apiSource,
    authSource: options.authSource,
    proxy: options.proxy,
    plugins: options.plugins,
  });
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
  const hostPort = await pickAvailablePort(options?.hostPort ?? DEFAULT_HOST_PORT, usedPorts);

  const next: RuntimeConfig = {
    ...runtimeConfig,
    host: { ...runtimeConfig.host, url: `http://localhost:${hostPort}`, port: hostPort },
    ui: { ...runtimeConfig.ui },
    api: { ...runtimeConfig.api },
    auth: runtimeConfig.auth ? { ...runtimeConfig.auth } : undefined,
    plugins: runtimeConfig.plugins ? { ...runtimeConfig.plugins } : undefined,
  };

  if (next.api.source === "local" && next.api.localPath) {
    const apiPort = await pickAvailablePort(next.api.port ?? DEFAULT_API_PORT, usedPorts);
    next.api = withLocalRuntimeUrl(next.api, apiPort);
  }

  if (next.auth?.source === "local" && next.auth.localPath) {
    const authPort = await pickAvailablePort(next.auth.port ?? DEFAULT_AUTH_PORT, usedPorts);
    next.auth = withLocalRuntimeUrl(next.auth, authPort);
  }

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

  if (next.plugins) {
    const entries = Object.entries(next.plugins).sort(([a], [b]) => a.localeCompare(b));
    let pluginBasePort = DEFAULT_PLUGIN_PORT_START;

    for (const [pluginId, plugin] of entries) {
      if (plugin.source === "local" && plugin.localPath) {
        const pluginPort = await pickAvailablePort(plugin.port ?? pluginBasePort, usedPorts);
        next.plugins[pluginId] = withLocalRuntimeUrl(plugin, pluginPort);
        pluginBasePort = pluginPort + 1;
      }

      if (plugin.ui?.source === "local" && plugin.ui.localPath) {
        const uiPort = await pickAvailablePort(plugin.ui.port ?? pluginBasePort, usedPorts);
        next.plugins[pluginId] = {
          ...next.plugins[pluginId]!,
          ui: withLocalRuntimeUrl(plugin.ui, uiPort),
        };
        pluginBasePort = uiPort + 1;
      }
    }
  }

  return next;
}
