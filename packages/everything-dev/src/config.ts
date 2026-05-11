import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fetchBosConfigFromFastKv } from "./fastkv";
import { getNetworkIdForAccount } from "./network";
import type { BosConfig, BosConfigInput, RuntimeConfig, RuntimePluginConfig } from "./types";
import { BosConfigSchema } from "./types";

const LOCAL_PREFIX = "local:";
const DEFAULT_HOST_PORT = 3000;

interface RuntimeTarget {
  source: "local" | "remote";
  url: string;
  localPath?: string;
  port?: number;
}

let cachedConfig: BosConfig | null = null;
let projectRoot: string | null = null;

export function clearConfigCache(): void {
  cachedConfig = null;
  projectRoot = null;
}

export function findConfigPath(cwd?: string): string | null {
  let dir = cwd ?? process.cwd();
  while (dir !== "/") {
    const configPath = join(dir, "bos.config.json");
    if (existsSync(configPath)) {
      return configPath;
    }
    dir = dirname(dir);
  }
  return null;
}

export function getConfig(): BosConfig | null {
  return cachedConfig;
}

export function getProjectRoot(): string {
  if (!projectRoot) {
    throw new Error("Config not loaded. Call loadConfig() first.");
  }
  return projectRoot;
}

export interface ConfigResult {
  config: BosConfig;
  runtime: RuntimeConfig;
  source: {
    path: string;
    extended?: string[];
    remote?: boolean;
  };
}

export async function loadConfig(options?: {
  cwd?: string;
  path?: string;
  env?: "development" | "production";
}): Promise<ConfigResult | null> {
  const configPath = options?.path ?? findConfigPath(options?.cwd);
  if (!configPath) {
    projectRoot = options?.cwd ?? process.cwd();
    return null;
  }

  const baseDir = dirname(configPath);

  try {
    const extendedChain: string[] = [];
    const parsed = await resolveConfigWithExtends(configPath, baseDir, new Set(), extendedChain);
    const config = BosConfigSchema.parse(parsed);

    cachedConfig = config;
    projectRoot = baseDir;

    const pluginRuntime = await resolveRuntimePlugins(
      config.plugins ?? {},
      baseDir,
      options?.env ?? "development",
    );
    const runtime = buildRuntimeConfig(config, baseDir, options?.env ?? "development", {
      plugins: pluginRuntime,
    });

    return {
      config,
      runtime,
      source: {
        path: configPath,
        extended: extendedChain.length > 0 ? extendedChain : undefined,
        remote: extendedChain.some((entry) => entry.startsWith("bos://")),
      },
    };
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error}`);
  }
}

export async function loadBosConfig(options?: {
  cwd?: string;
  path?: string;
  env?: "development" | "production";
}): Promise<RuntimeConfig> {
  const result = await loadConfig(options);
  if (!result) {
    throw new Error("No bos.config.json found");
  }

  return result.runtime;
}

export async function buildRuntimePluginsForConfig(
  config: BosConfig,
  baseDir: string,
  env: "development" | "production",
): Promise<Record<string, RuntimePluginConfig> | undefined> {
  const plugins = await resolveRuntimePlugins(config.plugins ?? {}, baseDir, env);
  return Object.keys(plugins).length > 0 ? plugins : undefined;
}

function resolveDevelopmentTarget(
  development: string | undefined,
  production: string | undefined,
  baseDir: string,
  forceSource?: "local" | "remote",
): RuntimeTarget {
  if (forceSource === "remote") {
    return resolveRuntimeTarget(production, baseDir, "remote");
  }
  const devTarget = resolveRuntimeTarget(development, baseDir);
  if (devTarget.source === "local" && (!devTarget.localPath || !existsSync(devTarget.localPath))) {
    return resolveRuntimeTarget(production, baseDir, "remote");
  }
  return devTarget;
}

export interface BuildRuntimeConfigOptions {
  plugins?: Record<string, RuntimePluginConfig>;
  hostSource?: "local" | "remote";
  uiSource?: "local" | "remote";
  apiSource?: "local" | "remote";
  authSource?: "local" | "remote";
  proxy?: string;
}

export function buildRuntimeConfig(
  config: BosConfig,
  baseDir: string,
  env: "development" | "production",
  options?: BuildRuntimeConfigOptions,
): RuntimeConfig {
  const uiConfig = config.app.ui;
  const apiConfig = config.app.api;
  const authConfig = config.app.auth;
  const uiRuntime =
    env === "development"
      ? resolveDevelopmentTarget(
          uiConfig.development,
          uiConfig.production,
          baseDir,
          options?.uiSource,
        )
      : resolveRuntimeTarget(uiConfig.production, baseDir, "remote");
  const apiRuntime =
    env === "development"
      ? resolveDevelopmentTarget(
          apiConfig.development,
          apiConfig.production,
          baseDir,
          options?.apiSource,
        )
      : resolveRuntimeTarget(apiConfig.production, baseDir, "remote");
  const authRuntime = authConfig
    ? env === "development"
      ? resolveDevelopmentTarget(
          authConfig.development,
          authConfig.production,
          baseDir,
          options?.authSource,
        )
      : resolveRuntimeTarget(authConfig.production, baseDir, "remote")
    : undefined;

  const hostConfig = config.app.host;
  const hostRuntime =
    env === "development"
      ? resolveDevelopmentTarget(
          hostConfig.development,
          hostConfig.production,
          baseDir,
          options?.hostSource,
        )
      : resolveRuntimeTarget(hostConfig.production, baseDir, "remote");

  const hostListeningUrl = resolveDevelopmentHostUrl(hostConfig.development);

  const hostIsRemote = hostRuntime.source === "remote";
  const uiIsRemote = uiRuntime.source === "remote";
  const apiIsRemote = apiRuntime.source === "remote";

  return {
    env,
    account: config.account,
    domain: config.domain,
    networkId: getNetworkIdForAccount(config.account),
    repository: config.repository,
    host: {
      name: "host",
      url: hostListeningUrl,
      entry: `${hostListeningUrl}/mf-manifest.json`,
      localPath: hostRuntime.localPath,
      port: hostRuntime.port ?? DEFAULT_HOST_PORT,
      secrets: hostConfig.secrets,
      integrity: hostIsRemote ? hostConfig.integrity : undefined,
      source: hostRuntime.source,
      remoteUrl: hostIsRemote ? hostRuntime.url : undefined,
    },
    shared: config.shared,
    ui: {
      name: uiConfig.name,
      url: uiRuntime.url,
      entry: uiRuntime.url ? `${uiRuntime.url}/mf-manifest.json` : "/mf-manifest.json",
      localPath: uiRuntime.localPath,
      port: uiRuntime.port,
      ssrUrl: uiIsRemote ? uiConfig.ssr : undefined,
      ssrIntegrity: uiIsRemote ? uiConfig.ssrIntegrity : undefined,
      integrity: uiIsRemote ? uiConfig.integrity : undefined,
      source: uiRuntime.source,
    },
    api: {
      name: apiConfig.name,
      url: apiRuntime.url,
      entry: apiRuntime.url ? `${apiRuntime.url}/mf-manifest.json` : "/mf-manifest.json",
      localPath: apiRuntime.localPath,
      port: apiRuntime.port,
      source: apiRuntime.source,
      proxy: options?.proxy ?? apiConfig.proxy,
      variables: apiConfig.variables,
      secrets: apiConfig.secrets,
      integrity: apiIsRemote ? apiConfig.integrity : undefined,
    },
    auth: authConfig
      ? {
          name: resolvePluginRuntimeName(undefined, authRuntime!.localPath, authConfig.name),
          url: authRuntime!.url,
          entry: authRuntime!.url ? `${authRuntime!.url}/mf-manifest.json` : "/mf-manifest.json",
          localPath: authRuntime!.localPath,
          port: authRuntime!.port,
          source: authRuntime!.source,
          proxy: authConfig.proxy,
          variables: authConfig.variables,
          secrets: authConfig.secrets,
          integrity: authRuntime!.source === "remote" ? authConfig.integrity : undefined,
        }
      : undefined,
    plugins:
      options?.plugins && Object.keys(options.plugins).length > 0 ? options.plugins : undefined,
  };
}

async function loadConfigFile(configPath: string, baseDir: string): Promise<BosConfigInput> {
  if (configPath.startsWith("bos://")) {
    return fetchBosConfigFromFastKv<BosConfigInput>(configPath);
  }

  const resolvedPath = isAbsolute(configPath) ? configPath : resolve(baseDir, configPath);
  return JSON.parse(readFileSync(resolvedPath, "utf-8")) as BosConfigInput;
}

async function resolveConfigWithExtends(
  configPath: string,
  baseDir: string,
  visited: Set<string>,
  chain: string[],
): Promise<BosConfigInput> {
  if (visited.has(configPath)) {
    throw new Error(`Circular extends detected: ${[...visited, configPath].join(" -> ")}`);
  }

  const config = await loadConfigFile(configPath, baseDir);
  if (configPath.startsWith("bos://")) {
    chain.push(configPath);
  }

  if (!config.extends) {
    return config;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(configPath);
  const parentPath = config.extends;
  const parentBaseDir = parentPath.startsWith("bos://")
    ? baseDir
    : isAbsolute(parentPath)
      ? dirname(parentPath)
      : baseDir;
  const parent = await resolveConfigWithExtends(parentPath, parentBaseDir, nextVisited, chain);

  return mergeConfigs(parent, config);
}

function mergeConfigs(parent: BosConfigInput, child: BosConfigInput): BosConfigInput {
  const result = mergeValues(parent, child) as BosConfigInput;
  if (child.plugins !== undefined) {
    result.plugins = child.plugins;
  }
  return result;
}

async function resolveRuntimePlugins(
  plugins: Record<string, BosConfigInput>,
  baseDir: string,
  env: "development" | "production",
  prefix: string[] = [],
): Promise<Record<string, RuntimePluginConfig>> {
  const out: Record<string, RuntimePluginConfig> = {};

  for (const [pluginId, pluginInput] of Object.entries(plugins)) {
    const runtimeKey = [...prefix, pluginId].join("/");
    const { config: resolvedConfig, baseDir: pluginBaseDir } = await resolveBosConfigInput(
      pluginInput,
      baseDir,
      new Set(),
      [],
    );

    const pluginRuntime = buildRuntimePluginConfig(
      runtimeKey,
      resolvedConfig,
      pluginBaseDir,
      env,
      pluginInput,
    );
    if (
      pluginInput.name &&
      typeof pluginInput.name === "string" &&
      !pluginRuntime.name.includes("/")
    ) {
      pluginRuntime.name = pluginInput.name;
    }

    const integrity = pluginInput.integrity;
    if (env === "production" && integrity) {
      pluginRuntime.integrity = integrity;
    }

    if (
      pluginRuntime.source === "remote" &&
      pluginRuntime.url &&
      !pluginRuntime.localPath &&
      typeof resolvedConfig.app?.api?.name !== "string" &&
      !pluginInput.name
    ) {
      pluginRuntime.name = await resolveRemotePluginRuntimeName(
        pluginRuntime.url,
        pluginRuntime.name,
      );
    }

    out[runtimeKey] = pluginRuntime;

    if (resolvedConfig.plugins && Object.keys(resolvedConfig.plugins).length > 0) {
      const nested = await resolveRuntimePlugins(resolvedConfig.plugins, pluginBaseDir, env, [
        ...prefix,
        pluginId,
      ]);
      Object.assign(out, nested);
    }
  }

  return out;
}

async function resolveRemotePluginRuntimeName(baseUrl: string, fallback: string): Promise<string> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/plugin.manifest.json`);
    if (!response.ok) {
      return fallback;
    }

    const manifest = (await response.json()) as {
      plugin?: { name?: unknown };
    };

    return typeof manifest.plugin?.name === "string" && manifest.plugin.name.length > 0
      ? manifest.plugin.name
      : fallback;
  } catch {
    return fallback;
  }
}

function buildRuntimePluginConfig(
  pluginId: string,
  config: BosConfigInput,
  baseDir: string,
  env: "development" | "production",
  source: BosConfigInput,
): RuntimePluginConfig {
  const apiConfig = config.app?.api ?? {};
  const apiDevelopment =
    typeof apiConfig.development === "string" ? apiConfig.development : undefined;
  const apiProduction = typeof apiConfig.production === "string" ? apiConfig.production : undefined;
  const sourceDevelopment = typeof source.development === "string" ? source.development : undefined;
  const sourceProduction = typeof source.production === "string" ? source.production : undefined;
  const proxy = typeof apiConfig.proxy === "string" ? apiConfig.proxy : undefined;
  const development = apiDevelopment ?? sourceDevelopment;
  const production = apiProduction ?? sourceProduction;
  const runtimeTarget =
    env === "development"
      ? resolveDevelopmentTarget(development, production, baseDir)
      : resolveRuntimeTarget(production, baseDir, "remote");
  const apiName = resolvePluginRuntimeName(
    typeof apiConfig.name === "string" ? apiConfig.name : undefined,
    runtimeTarget.localPath,
    pluginId,
  );

  return {
    name: apiName,
    url: runtimeTarget.url,
    entry: runtimeTarget.url
      ? `${runtimeTarget.url.replace(/\/$/, "")}/mf-manifest.json`
      : "/mf-manifest.json",
    source: runtimeTarget.source,
    localPath: runtimeTarget.localPath,
    port: runtimeTarget.port,
    proxy: proxy ?? (typeof source.proxy === "string" ? source.proxy : undefined),
    variables: normalizeStringRecord(apiConfig.variables ?? source.variables),
    secrets: normalizeStringArray(apiConfig.secrets ?? source.secrets),
  };
}

export function resolvePluginRuntimeName(
  explicitName: string | undefined,
  localPath: string | undefined,
  fallback: string,
): string {
  if (explicitName) {
    return explicitName;
  }

  if (!localPath) {
    return fallback;
  }

  try {
    const packageJsonPath = join(localPath, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { name?: unknown };
    if (typeof packageJson.name === "string" && packageJson.name.length > 0) {
      return packageJson.name;
    }
  } catch {}

  return fallback;
}

async function resolveBosConfigInput(
  input: BosConfigInput,
  baseDir: string,
  visited: Set<string>,
  chain: string[],
): Promise<{ config: BosConfigInput; baseDir: string }> {
  if (input.extends) {
    const parentBaseDir = input.extends.startsWith("bos://")
      ? baseDir
      : isAbsolute(input.extends)
        ? dirname(input.extends)
        : baseDir;
    const config = await resolveConfigWithExtends(input.extends, parentBaseDir, visited, chain);
    return { config: mergeConfigs(config, input), baseDir: parentBaseDir };
  }

  return { config: input, baseDir };
}

function mergeValues(parent: unknown, child: unknown): unknown {
  if (Array.isArray(parent) && Array.isArray(child)) {
    return child;
  }

  if (isPlainObject(parent) && isPlainObject(child)) {
    const merged: Record<string, unknown> = { ...parent };
    for (const [key, value] of Object.entries(child)) {
      merged[key] = key in merged ? mergeValues(merged[key], value) : value;
    }
    return merged;
  }

  return child ?? parent;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      out[key] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return out.length > 0 ? out : undefined;
}

function resolveRuntimeTarget(
  value: string | undefined,
  baseDir: string,
  defaultSource: "local" | "remote" = "remote",
): RuntimeTarget {
  if (!value) {
    return { source: defaultSource, url: "" };
  }

  if (value.startsWith(LOCAL_PREFIX)) {
    const localTarget = value.slice(LOCAL_PREFIX.length).trim();
    if (!localTarget) {
      throw new Error(`Invalid local development target: ${value}`);
    }

    const localPath = resolve(baseDir, localTarget);
    if (!existsSync(localPath)) {
      return { source: "local", url: "" };
    }

    return {
      source: "local",
      url: "",
      localPath,
    };
  }

  return {
    source: defaultSource,
    url: value.replace(/\/$/, ""),
    port: parsePort(value),
  };
}

export function isLocalDevelopmentTarget(value: string | undefined): boolean {
  return typeof value === "string" && value.startsWith(LOCAL_PREFIX);
}

export function resolveLocalDevelopmentPath(
  value: string | undefined,
  baseDir: string,
): string | null {
  if (!isLocalDevelopmentTarget(value)) {
    return null;
  }

  const localTarget = value!.slice(LOCAL_PREFIX.length).trim();
  return localTarget ? resolve(baseDir, localTarget) : null;
}

export function resolveDevelopmentHostUrl(value: string | undefined): string {
  if (!value || isLocalDevelopmentTarget(value)) {
    return `http://localhost:${DEFAULT_HOST_PORT}`;
  }

  return value.replace(/\/$/, "");
}

export function getHostDevelopmentPort(value: string | undefined): number {
  return parsePort(resolveDevelopmentHostUrl(value));
}

export function parsePort(url: string): number {
  try {
    const parsed = new URL(url);
    return parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === "https:" ? 443 : 80;
  } catch {
    return 3000;
  }
}

export type { BosConfig, RuntimeConfig } from "./types";
export { BosConfigSchema } from "./types";
