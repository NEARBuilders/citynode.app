import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fetchBosConfigFromFastKv } from "./fastkv";
import {
  type BosEnv,
  isPlainObject,
  mergeBosConfigWithExtends,
  type ResolvedConfigMeta,
  rebuildOrderedConfig,
  resolveExtendsRef,
} from "./merge";
import { getNetworkIdForAccount } from "./network";
import type {
  BosConfig,
  BosConfigInput,
  ExtendsConfig,
  RuntimeConfig,
  RuntimePluginConfig,
} from "./types";
import { BosConfigSchema } from "./types";

const LOCAL_PREFIX = "local:";
const DEFAULT_HOST_PORT = 3000;
const RESOLVED_CONFIG_FILENAME = "bos.resolved-config.json";

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
  env?: BosEnv;
}): Promise<ConfigResult | null> {
  const configPath = options?.path ?? findConfigPath(options?.cwd);
  if (!configPath) {
    projectRoot = options?.cwd ?? process.cwd();
    return null;
  }

  const baseDir = dirname(configPath);
  const env = options?.env ?? "development";
  const runtimeEnv: BosEnv = env === "staging" ? "production" : env;

  try {
    const extendedChain: string[] = [];
    const parsed = await resolveConfigWithExtends(
      configPath,
      baseDir,
      new Set(),
      extendedChain,
      env,
    );
    const config = BosConfigSchema.parse(parsed);

    cachedConfig = config;
    projectRoot = baseDir;

    const pluginRuntime = await resolveRuntimePlugins(config.plugins ?? {}, baseDir, runtimeEnv);
    const runtime = buildRuntimeConfig(config, baseDir, runtimeEnv, {
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
  env?: BosEnv;
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
  env: BosEnv,
): Promise<Record<string, RuntimePluginConfig> | undefined> {
  const plugins = await resolveRuntimePlugins(config.plugins ?? {}, baseDir, env);
  return Object.keys(plugins).length > 0 ? plugins : undefined;
}

export function getResolvedConfigPath(configDir: string): string {
  return join(configDir, ".bos", RESOLVED_CONFIG_FILENAME);
}

export function loadResolvedConfig(configDir: string): BosConfig | null {
  const resolvedPath = getResolvedConfigPath(configDir);
  if (!existsSync(resolvedPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(resolvedPath, "utf-8"));
    if (!isPlainObject(raw)) return null;
    const { _resolved, ...configData } = raw;
    return BosConfigSchema.parse(configData);
  } catch {
    return null;
  }
}

export function writeResolvedConfig(
  configDir: string,
  config: BosConfig,
  env: BosEnv,
  extendsChain?: string[],
  source?: string,
): void {
  const resolvedPath = getResolvedConfigPath(configDir);
  const resolvedDir = dirname(resolvedPath);
  if (!existsSync(resolvedDir)) {
    mkdirSync(resolvedDir, { recursive: true });
  }

  const ordered = rebuildOrderedConfig(config);
  const meta: ResolvedConfigMeta = {
    env,
    resolvedAt: new Date().toISOString(),
    extendsChain: extendsChain ?? [],
    ...(source ? { source } : {}),
  };
  const output = {
    _resolved: meta,
    ...ordered,
  };

  const content = `${JSON.stringify(output, null, 2)}\n`;
  try {
    if (readFileSync(resolvedPath, "utf-8") === content) return;
  } catch {
    // file doesn't exist yet
  }
  writeFileSync(resolvedPath, content);
}

export function resolveBosConfigPath(configDir: string): string {
  const resolvedPath = getResolvedConfigPath(configDir);
  if (existsSync(resolvedPath)) return resolvedPath;
  return join(configDir, "bos.config.json");
}

export function readBosConfigForBuild(configDir: string): Record<string, unknown> {
  const resolvedPath = getResolvedConfigPath(configDir);
  if (existsSync(resolvedPath)) {
    try {
      const raw = JSON.parse(readFileSync(resolvedPath, "utf-8"));
      if (isPlainObject(raw)) {
        const { _resolved, ...configData } = raw;
        return configData as Record<string, unknown>;
      }
    } catch {}
  }
  const bosConfigPath = join(configDir, "bos.config.json");
  return JSON.parse(readFileSync(bosConfigPath, "utf-8")) as Record<string, unknown>;
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
  env: BosEnv,
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

  const hostListeningUrl =
    env === "development"
      ? resolveDevelopmentHostUrl(hostConfig.development)
      : `http://localhost:${hostRuntime.port ?? DEFAULT_HOST_PORT}`;

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
    auth: (() => {
      if (!authConfig || !authRuntime) return undefined;
      return {
        name: resolvePluginRuntimeName(undefined, authRuntime.localPath, authConfig.name),
        url: authRuntime.url,
        entry: authRuntime.url ? `${authRuntime.url}/mf-manifest.json` : "/mf-manifest.json",
        localPath: authRuntime.localPath,
        port: authRuntime.port,
        source: authRuntime.source,
        proxy: authConfig.proxy,
        variables: authConfig.variables,
        secrets: authConfig.secrets,
        integrity: authRuntime.source === "remote" ? authConfig.integrity : undefined,
      };
    })(),
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
  env: BosEnv = "development",
): Promise<BosConfigInput> {
  if (visited.has(configPath)) {
    throw new Error(`Circular extends detected: ${[...visited, configPath].join(" -> ")}`);
  }

  const config = await loadConfigFile(configPath, baseDir);
  chain.push(configPath);

  if (!config.extends) {
    return config;
  }

  const extendsRef = resolveExtendsRef(config.extends as string | ExtendsConfig, env);
  if (!extendsRef) {
    return config;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(configPath);
  const parentBaseDir = extendsRef.startsWith("bos://")
    ? baseDir
    : isAbsolute(extendsRef)
      ? dirname(extendsRef)
      : baseDir;
  const parent = await resolveConfigWithExtends(extendsRef, parentBaseDir, nextVisited, chain, env);

  return mergeBosConfigWithExtends(parent, config);
}

type PluginOverrideValue = BosConfigInput | null | false;

async function resolveRuntimePlugins(
  plugins: Record<string, PluginOverrideValue>,
  baseDir: string,
  env: BosEnv,
  prefix: string[] = [],
): Promise<Record<string, RuntimePluginConfig>> {
  const out: Record<string, RuntimePluginConfig> = {};

  for (const [pluginId, pluginInput] of Object.entries(plugins)) {
    if (pluginInput === null || pluginInput === false) continue;
    const runtimeKey = [...prefix, pluginId].join("/");
    const { config: resolvedConfig, baseDir: pluginBaseDir } = await resolveBosConfigInput(
      pluginInput,
      baseDir,
      new Set(),
      [],
      env,
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/plugin.manifest.json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

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
  env: BosEnv,
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

  const uiConfig = config.app?.ui;
  const uiDevelopment =
    typeof uiConfig?.development === "string" ? uiConfig.development : undefined;
  const uiProduction = typeof uiConfig?.production === "string" ? uiConfig.production : undefined;
  const uiRuntime =
    uiConfig && (uiDevelopment || uiProduction)
      ? env === "development"
        ? resolveDevelopmentTarget(uiDevelopment, uiProduction, baseDir)
        : resolveRuntimeTarget(uiProduction, baseDir, "remote")
      : undefined;

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
    ui: uiRuntime
      ? {
          name: typeof uiConfig?.name === "string" ? uiConfig.name : `${apiName}-ui`,
          url: uiRuntime.url,
          entry: uiRuntime.url
            ? `${uiRuntime.url.replace(/\/$/, "")}/mf-manifest.json`
            : "/mf-manifest.json",
          source: uiRuntime.source,
          localPath: uiRuntime.localPath,
          port: uiRuntime.port,
          integrity:
            uiRuntime.source === "remote" && typeof uiConfig?.integrity === "string"
              ? uiConfig.integrity
              : undefined,
        }
      : undefined,
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
  env: BosEnv = "development",
): Promise<{ config: BosConfigInput; baseDir: string }> {
  if (input.extends) {
    const extendsRef = resolveExtendsRef(input.extends as string | ExtendsConfig, env);
    if (!extendsRef) {
      return { config: input, baseDir };
    }
    const parentBaseDir = extendsRef.startsWith("bos://")
      ? baseDir
      : isAbsolute(extendsRef)
        ? dirname(extendsRef)
        : baseDir;
    const config = await resolveConfigWithExtends(extendsRef, parentBaseDir, visited, chain, env);
    return {
      config: mergeBosConfigWithExtends(config, input),
      baseDir,
    };
  }

  return { config: input, baseDir };
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
    const localTarget = value?.slice(LOCAL_PREFIX.length).trim();
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

export function isLocalDevelopmentTarget(
  value: string | undefined,
): value is `${typeof LOCAL_PREFIX}${string}` {
  return typeof value === "string" && value.startsWith(LOCAL_PREFIX);
}

export function resolveLocalDevelopmentPath(
  value: string | undefined,
  baseDir: string,
): string | null {
  if (!isLocalDevelopmentTarget(value)) {
    return null;
  }

  const localTarget = value.slice(LOCAL_PREFIX.length).trim();
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

export { BOS_CONFIG_ORDER, rebuildOrderedConfig } from "./merge";
export type { BosConfig, RuntimeConfig } from "./types";
export { BosConfigSchema } from "./types";
