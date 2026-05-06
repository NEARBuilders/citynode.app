import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import {
  getProjectRoot,
  isLocalDevelopmentTarget,
  parsePort,
  resolveLocalDevelopmentPath,
  resolvePluginRuntimeName,
} from "./config";
import { getNetworkIdForAccount } from "./network";
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
  const configDir = getProjectRoot();
  const hostConfig = bosConfig.app.host;
  const uiConfig = bosConfig.app.ui;
  const apiConfig = bosConfig.app.api;
  const authConfig = bosConfig.app.auth;

  function resolveDevelopmentEntry(
    entry: { development?: string; production?: string },
    preferredSource: "local" | "remote",
  ): { source: "local" | "remote"; url: string; localPath?: string; port?: number } {
    if (preferredSource === "remote") {
      return { source: "remote", url: entry.production ?? "" };
    }

    const localPath = resolveLocalDevelopmentPath(entry.development, configDir);
    if (localPath && existsSync(localPath)) {
      return { source: "local", url: "", localPath };
    }

    const devUrl =
      entry.development && !isLocalDevelopmentTarget(entry.development)
        ? entry.development.replace(/\/$/, "")
        : null;
    if (devUrl) {
      return { source: "local", url: devUrl, port: parsePort(devUrl) };
    }

    return { source: "remote", url: entry.production ?? "" };
  }

  const hostEntry = resolveDevelopmentEntry(hostConfig, options.hostSource ?? "local");
  const uiEntry = resolveDevelopmentEntry(uiConfig, options.uiSource ?? "local");
  const apiEntry = resolveDevelopmentEntry(apiConfig, options.apiSource ?? "local");
  const authEntry = authConfig
    ? resolveDevelopmentEntry(authConfig, options.authSource ?? "local")
    : undefined;

  const hostUrl = `http://localhost:${DEFAULT_HOST_PORT}`;

  return {
    env: options.env ?? "development",
    account: bosConfig.account,
    domain: bosConfig.domain,
    networkId: getNetworkIdForAccount(bosConfig.account),
    host: {
      name: "host",
      url: hostUrl,
      entry: `${hostUrl}/mf-manifest.json`,
      localPath: hostEntry.localPath,
      port: hostEntry.port ?? DEFAULT_HOST_PORT,
      secrets: hostConfig.secrets,
      integrity: hostEntry.source === "remote" ? hostConfig.integrity : undefined,
      source: hostEntry.source,
      remoteUrl: hostEntry.source === "remote" ? hostEntry.url : undefined,
    },
    shared: bosConfig.shared,
    ui: uiConfig
      ? {
          name: uiConfig.name,
          url: uiEntry.url,
          entry: uiEntry.url ? `${uiEntry.url}/mf-manifest.json` : "/mf-manifest.json",
          localPath: uiEntry.localPath,
          port: uiEntry.port,
          ssrUrl: uiEntry.source === "remote" ? uiConfig.ssr : undefined,
          ssrIntegrity: uiEntry.source === "remote" ? uiConfig.ssrIntegrity : undefined,
          integrity: uiEntry.source === "remote" ? uiConfig.integrity : undefined,
          source: uiEntry.source,
        }
      : {
          name: "ui",
          url: "",
          entry: "/mf-manifest.json",
          source: uiEntry.source,
        },
    api: apiConfig
      ? {
          name: apiConfig.name,
          url: apiEntry.url,
          entry: apiEntry.url ? `${apiEntry.url}/mf-manifest.json` : "/mf-manifest.json",
          localPath: apiEntry.localPath,
          port: apiEntry.port,
          source: apiEntry.source,
          proxy: options.proxy ?? apiConfig.proxy,
          variables: apiConfig.variables,
          secrets: apiConfig.secrets,
          integrity: apiEntry.source === "remote" ? apiConfig.integrity : undefined,
        }
      : {
          name: "api",
          url: "",
          entry: "/mf-manifest.json",
          source: apiEntry.source,
        },
    auth:
      authEntry && authConfig
        ? {
            name: resolvePluginRuntimeName(undefined, authEntry.localPath, authConfig.name),
            url: authEntry.url,
            entry: authEntry.url ? `${authEntry.url}/mf-manifest.json` : "/mf-manifest.json",
            localPath: authEntry.localPath,
            port: authEntry.port,
            source: authEntry.source,
            proxy: authConfig.proxy,
            variables: authConfig.variables,
            secrets: authConfig.secrets,
            integrity: authEntry.source === "remote" ? authConfig.integrity : undefined,
          }
        : undefined,
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
