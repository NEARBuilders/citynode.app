import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runServer } from "../../src/program";
import type { RuntimeConfig } from "../../src/services/config";

type RawBosConfig = {
  account?: string;
  domain?: string;
  shared?: RuntimeConfig["shared"];
  app?: {
    ui?: {
      name?: string;
      production?: string;
      ssr?: string;
    };
    api?: {
      name?: string;
      production?: string;
      proxy?: string;
      variables?: Record<string, string>;
      secrets?: string[];
    };
  };
};

export type RuntimeRemoteScenarioName = "remote-client" | "remote-ssr" | "remote-proxy";

export interface RuntimeRemoteScenario {
  name: RuntimeRemoteScenarioName;
  title: string;
  ssr: boolean;
  proxy: boolean;
  available: boolean;
  skipReason?: string;
}

export interface RuntimeRemoteHost {
  baseUrl: string;
  config: RuntimeConfig;
  stop: () => Promise<void>;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, "../../..");
const bosConfigPath = path.join(workspaceRoot, "bos.config.json");

function normalizeUrl(url: string) {
  return url.replace(/\/$/, "");
}

function toMfEntry(url: string) {
  return `${normalizeUrl(url)}/mf-manifest.json`;
}

async function loadRawBosConfig(): Promise<RawBosConfig> {
  const raw = await readFile(bosConfigPath, "utf8");
  return JSON.parse(raw) as RawBosConfig;
}

async function getAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate test port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function getScenarioSkipReason(config: RawBosConfig, scenario: RuntimeRemoteScenarioName) {
  const uiProduction = config.app?.ui?.production;
  const uiSsr = config.app?.ui?.ssr;

  if (!config.account) {
    return "Missing account in bos.config.json";
  }

  if (!uiProduction) {
    return "Missing app.ui.production in bos.config.json";
  }

  if (scenario === "remote-ssr") {
    if (!uiSsr) {
      return "Missing app.ui.ssr in bos.config.json";
    }
  }

  return undefined;
}

export async function getRuntimeRemoteScenarios(): Promise<RuntimeRemoteScenario[]> {
  const config = await loadRawBosConfig();

  return [
    {
      name: "remote-client",
      title: "remote ui + remote api without ssr",
      ssr: false,
      proxy: false,
      skipReason: getScenarioSkipReason(config, "remote-client"),
      available: !getScenarioSkipReason(config, "remote-client"),
    },
    {
      name: "remote-ssr",
      title: "remote ui + remote api with ssr",
      ssr: true,
      proxy: false,
      skipReason: getScenarioSkipReason(config, "remote-ssr"),
      available: !getScenarioSkipReason(config, "remote-ssr"),
    },
    {
      name: "remote-proxy",
      title: "remote ui + proxy api without ssr",
      ssr: false,
      proxy: true,
      skipReason: getScenarioSkipReason(config, "remote-proxy"),
      available: !getScenarioSkipReason(config, "remote-proxy"),
    },
  ];
}

function buildRuntimeConfig(
  config: RawBosConfig,
  scenario: RuntimeRemoteScenario,
  hostUrl: string,
): RuntimeConfig {
  const uiUrl = config.app?.ui?.production;
  const apiUrl = scenario.proxy
    ? (config.app?.api?.proxy ?? (config.domain ? `https://${config.domain}` : undefined))
    : (config.app?.api?.production ?? "");

  if (!config.account || !uiUrl) {
    throw new Error(`Scenario ${scenario.name} is missing required remote config`);
  }

  return {
    env: "development",
    account: config.account,
    title: config.account,
    host: {
      name: "host",
      url: hostUrl,
      entry: `${hostUrl}/mf-manifest.json`,
      source: "remote" as const,
    },
    shared: config.shared,
    ui: {
      name: config.app?.ui?.name ?? "ui",
      url: normalizeUrl(uiUrl),
      entry: toMfEntry(uiUrl),
      source: "remote",
      ssrUrl: scenario.ssr ? config.app?.ui?.ssr : undefined,
    },
    api: {
      name: config.app?.api?.name ?? "api",
      url: apiUrl ? normalizeUrl(apiUrl) : "",
      entry: apiUrl ? toMfEntry(apiUrl) : "",
      source: "remote",
      proxy: scenario.proxy
        ? normalizeUrl(config.app?.api?.proxy ?? `https://${config.domain}`)
        : undefined,
      variables: config.app?.api?.variables,
      secrets: config.app?.api?.secrets,
    },
  } as RuntimeConfig;
}

export async function startRuntimeRemoteHost(
  scenario: RuntimeRemoteScenario,
): Promise<RuntimeRemoteHost> {
  if (!scenario.available) {
    throw new Error(scenario.skipReason ?? `Scenario ${scenario.name} is unavailable`);
  }

  const rawConfig = await loadRawBosConfig();
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const runtimeConfig = buildRuntimeConfig(rawConfig, scenario, baseUrl);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousHost = process.env.HOST;
  const previousPort = process.env.PORT;
  process.env.NODE_ENV = "development";
  process.env.HOST = "127.0.0.1";
  process.env.PORT = String(port);

  const handle = runServer({ config: runtimeConfig });

  try {
    await handle.ready;
  } catch (error) {
    await handle.shutdown().catch(() => undefined);
    process.env.NODE_ENV = previousNodeEnv;
    process.env.HOST = previousHost;
    process.env.PORT = previousPort;
    throw error;
  }

  return {
    baseUrl,
    config: runtimeConfig,
    stop: async () => {
      await handle.shutdown();
      process.env.NODE_ENV = previousNodeEnv;
      process.env.HOST = previousHost;
      process.env.PORT = previousPort;
    },
  };
}
