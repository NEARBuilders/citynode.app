import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { Effect } from "effect";
import { syncApiContractBridge } from "./api-contract";
import { buildRuntimeConfig, detectLocalPackages, prepareDevelopmentRuntimeConfig } from "./app";
import {
  copyFilteredFiles,
  fetchParentConfig,
  personalizeConfig,
  readTemplatekeep,
  resolveSourceDir,
  runBunInstall,
  writeInitSnapshot,
} from "./cli/init";
import { promptInitOptions } from "./cli/prompts";
import { getStatus } from "./cli/status";
import { syncTemplate } from "./cli/sync";
import { upgradeTemplate } from "./cli/upgrade";
import {
  buildRuntimePluginsForConfig,
  findConfigPath,
  getHostDevelopmentPort,
  getProjectRoot,
  loadConfig,
  resolveLocalDevelopmentPath,
} from "./config";
import {
  type BosConfigResult,
  type BuildOptions,
  bosContract,
  type DevOptions,
  type InitOptions,
  type KeyPublishOptions,
  type PluginAddOptions,
  type PluginListResult,
  type PluginPublishOptions,
  type PluginRemoveOptions,
  type PublishOptions,
  type StartOptions,
  type SyncOptions,
  type TypesGenOptions,
  type UpgradeOptions,
} from "./contract";
import { devApp, startApp } from "./dev-session";
import {
  buildRegistryConfigUrl,
  buildRegistryConfigUrlForNetwork,
  fetchBosConfigFromFastKv,
  fetchPluginFromRegistry,
  fetchRemotePluginManifest,
  getRegistryNamespaceForAccount,
  getRegistryNamespaceForNetwork,
  type PluginManifest,
  parsePluginBosUrl,
} from "./fastkv";
import { computeSriHashForUrl } from "./integrity";
import { addFunctionCallAccessKey, ensureNearCli, executeTransaction } from "./near-cli";
import { getNetworkIdForAccount } from "./network";
import { createPlugin, z } from "./sdk";
import {
  type AppOrchestrator,
  buildDescription,
  buildServiceDescriptorMap,
} from "./service-descriptor";
import { syncAndGenerateSharedUi } from "./shared";
import type { BosConfig, RuntimeConfig, SourceMode } from "./types";
import { run } from "./utils/run";
import { colors } from "./utils/theme";

function ensureEnvFile(configDir: string): void {
  const envPath = join(configDir, ".env");
  const examplePath = join(configDir, ".env.example");

  if (existsSync(envPath)) return;

  if (!existsSync(examplePath)) return;

  const content = readFileSync(examplePath, "utf-8");
  const lines = content.split("\n");

  const secret = randomBytes(32).toString("base64url");

  const updated = lines
    .map((line) => {
      if (/^BETTER_AUTH_SECRET=/.test(line)) {
        return `BETTER_AUTH_SECRET=${secret}`;
      }
      if (/^BETTER_AUTH_URL=/.test(line)) {
        return `BETTER_AUTH_URL=http://localhost:3000`;
      }
      return line;
    })
    .join("\n");

  writeFileSync(envPath, updated);
  console.log(`[CLI] Created .env from .env.example with generated BETTER_AUTH_SECRET`);
}

const buildCommands: Record<string, { cmd: string; args: string[] }> = {
  host: { cmd: "bun", args: ["run", "build"] },
  ui: { cmd: "bun", args: ["run", "build"] },
  api: { cmd: "bun", args: ["run", "build"] },
};

const PUBLISH_FUNCTION_NAMES = ["__fastdata_kv"];

type BosDeps = {
  bosConfig: BosConfig | null;
  runtimeConfig: RuntimeConfig | null;
  configDir: string;
};

type PluginAttachmentConfig = NonNullable<BosConfig["plugins"]>[string];

function parseSourceMode(value: string | undefined, defaultValue: SourceMode): SourceMode {
  if (value === "local" || value === "remote") return value;
  return defaultValue;
}

function buildConfigResult(bosConfig: BosConfig | null): BosConfigResult {
  const packages = bosConfig ? Object.keys(bosConfig.app) : [];
  const remotes = packages.filter((name) => name !== "host");

  return {
    config: bosConfig,
    packages,
    remotes,
  };
}

type WorkspaceTarget = {
  key: string;
  kind: "app" | "plugin";
  path: string;
};

function resolveWorkspaceTarget(
  key: string,
  bosConfig: BosConfig | null,
  runtimeConfig: RuntimeConfig | null,
  configDir: string,
): WorkspaceTarget | null {
  if (bosConfig?.app && key in bosConfig.app) {
    const appEntry = (bosConfig.app as Record<string, { development?: string }>)[key];
    const devPath = resolveLocalDevelopmentPath(appEntry?.development, configDir);
    if (devPath) {
      return {
        key,
        kind: "app",
        path: devPath,
      };
    }
    return {
      key,
      kind: "app",
      path: `${configDir}/${key}`,
    };
  }

  const runtimePlugin = runtimeConfig?.plugins?.[key];
  const pluginPath =
    runtimePlugin?.localPath ??
    resolveLocalDevelopmentPath(bosConfig?.plugins?.[key]?.development, configDir);
  if (pluginPath) {
    return {
      key,
      kind: "plugin",
      path: pluginPath,
    };
  }

  return null;
}

function isValidProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveProxyUrl(bosConfig: BosConfig | null): string | null {
  if (!bosConfig) return null;
  const apiConfig = bosConfig.app.api;
  if (!apiConfig) return null;
  if (apiConfig.proxy && isValidProxyUrl(apiConfig.proxy)) return apiConfig.proxy;
  if (apiConfig.production && isValidProxyUrl(apiConfig.production)) return apiConfig.production;
  return null;
}

function sanitizePluginKey(value: string): string {
  return value
    .replace(/[^A-Za-z0-9/_-]/g, "-")
    .replace(/\/+/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9_-]/g, "-"))
    .join("/")
    .replace(/^\/+|\/+$/g, "");
}

function defaultPluginKey(source: string): string {
  const normalized = source.replace(/^local:/, "").replace(/\/$/, "");
  if (source.startsWith("local:")) {
    return sanitizePluginKey(basename(normalized)) || "plugin";
  }

  try {
    const url = new URL(source);
    return sanitizePluginKey(basename(url.pathname) || url.hostname) || "plugin";
  } catch {
    return sanitizePluginKey(source) || "plugin";
  }
}

function pluginLocalPath(configDir: string, attachment: PluginAttachmentConfig): string | null {
  const source = attachment.development ?? attachment.production;
  if (!source?.startsWith("local:")) {
    return null;
  }

  return join(configDir, source.slice("local:".length));
}

async function saveBosConfig(configDir: string, config: BosConfig): Promise<void> {
  const filePath = join(configDir, "bos.config.json");
  const next = `${JSON.stringify(config, null, 2)}\n`;
  try {
    if (readFileSync(filePath, "utf8") === next) return;
  } catch {
    // file does not exist yet
  }

  writeFileSync(filePath, next);
}

function listPluginAttachments(config: BosConfig | null) {
  return (Object.entries(config?.plugins ?? {}) as Array<[string, PluginAttachmentConfig]>)
    .map(([key, attachment]) => ({
      key,
      development: attachment.development,
      production: attachment.production,
      localPath: attachment.development?.startsWith("local:")
        ? attachment.development.slice("local:".length)
        : undefined,
      source: attachment.development?.startsWith("local:")
        ? ("local" as const)
        : ("remote" as const),
      integrity: attachment.integrity,
      version: attachment.version,
      name: attachment.name,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function refreshApiContractBridge(
  configDir: string,
  env: "development" | "production" = "development",
): Promise<void> {
  const refreshed = await loadConfig({ cwd: configDir, env });
  if (!refreshed) return;

  await syncApiContractBridge({
    configDir,
    runtimeConfig: refreshed.runtime,
    apiBaseUrl: refreshed.runtime.api.url,
  });
}

function extractPublishedUrl(output: string): string | null {
  const match = output.match(/https?:\/\/[^\s"'<>]+/g);
  if (!match || match.length === 0) return null;
  return match[match.length - 1] ?? null;
}

async function buildEveryPluginQuietly(cwd: string) {
  const packageDir = `${cwd}/packages/every-plugin`;
  const packageExists = await Bun.file(`${packageDir}/package.json`).exists();
  if (!packageExists) {
    return;
  }

  const distPath = `${cwd}/packages/every-plugin/dist/build/rspack/plugin.mjs`;
  const distExists = await Bun.file(distPath).exists();

  if (distExists) {
    return;
  }

  const result = (await run("bun", ["run", "--cwd", "packages/every-plugin", "build"], {
    cwd,
    capture: true,
  })) as { stdout: string; stderr: string; exitCode: number };

  if (result.exitCode === 0) {
    console.log("[build:ssr] build succeeded");
    return;
  }

  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }

  throw new Error(
    `bun run --cwd packages/every-plugin build failed with exit code ${result.exitCode}`,
  );
}

async function buildEverythingDevQuietly(cwd: string) {
  const packageDir = `${cwd}/packages/everything-dev`;
  const packageExists = await Bun.file(`${packageDir}/package.json`).exists();
  if (!packageExists) {
    return;
  }

  const distPath = `${cwd}/packages/everything-dev/dist/index.mjs`;
  const distExists = await Bun.file(distPath).exists();

  if (distExists) {
    return;
  }

  const result = (await run("bun", ["run", "--cwd", "packages/everything-dev", "build"], {
    cwd,
    capture: true,
  })) as { stdout: string; stderr: string; exitCode: number };

  if (result.exitCode === 0) {
    console.log("[everything-dev] build succeeded");
    return;
  }

  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }

  throw new Error(
    `bun run --cwd packages/everything-dev build failed with exit code ${result.exitCode}`,
  );
}

async function fetchPublishedConfig(
  accountId: string,
  gatewayId: string,
): Promise<BosConfig | null> {
  try {
    return await fetchBosConfigFromFastKv<BosConfig>(`bos://${accountId}/${gatewayId}`);
  } catch {
    return null;
  }
}

function selectWorkspaceTargets(packages: string, bosConfig: BosConfig | null): string[] {
  const allPackages = [
    ...Object.keys(bosConfig?.app ?? {}),
    ...Object.keys(bosConfig?.plugins ?? {}),
  ];
  if (packages === "all") {
    return allPackages;
  }

  return packages
    .split(",")
    .map((pkg) => pkg.trim())
    .filter((pkg) => allPackages.includes(pkg));
}

async function buildWorkspaceTargets(opts: {
  configDir: string;
  bosConfig: BosConfig | null;
  runtimeConfig: RuntimeConfig | null;
  targets: string[];
  deploy: boolean;
}): Promise<{ built: string[]; skipped: string[] }> {
  const existing: WorkspaceTarget[] = [];
  const skipped: string[] = [];

  for (const target of opts.targets) {
    const resolved = resolveWorkspaceTarget(
      target,
      opts.bosConfig,
      opts.runtimeConfig,
      opts.configDir,
    );
    if (!resolved) {
      skipped.push(target);
      continue;
    }

    const exists = await Bun.file(`${resolved.path}/package.json`).exists();
    if (exists) existing.push(resolved);
    else skipped.push(target);
  }

  if (existing.length === 0) {
    return { built: [], skipped };
  }

  const sharedSync = await syncAndGenerateSharedUi({
    configDir: opts.configDir,
    hostMode: "local",
    bosConfig: opts.bosConfig ?? undefined,
  });
  if (sharedSync.catalogChanged) {
    await run("bun", ["install"], { cwd: opts.configDir });
  }

  if (existing.some((entry) => entry.key === "api")) {
    await buildEveryPluginQuietly(opts.configDir);
  }

  await buildEverythingDevQuietly(opts.configDir);

  const env: Record<string, string> = {
    ...process.env,
    NODE_ENV: opts.deploy ? "production" : "development",
  };
  if (opts.deploy) {
    env.DEPLOY = "true";
  } else {
    delete env.DEPLOY;
  }

  const orderedExisting = opts.deploy
    ? [
        ...existing.filter((entry) => entry.kind === "app" && entry.key !== "host"),
        ...existing.filter((entry) => entry.kind === "plugin"),
        ...existing.filter((entry) => entry.kind === "app" && entry.key === "host"),
      ]
    : existing;
  const built: string[] = [];

  for (const resolved of orderedExisting) {
    const pkgJson = JSON.parse(await Bun.file(`${resolved.path}/package.json`).text()) as {
      scripts?: Record<string, string>;
    };
    const shouldDeployScript = opts.deploy && pkgJson.scripts?.deploy;
    const buildConfig = shouldDeployScript
      ? { cmd: "bun", args: ["run", "deploy"] }
      : (buildCommands[resolved.key] ?? { cmd: "bun", args: ["run", "build"] });

    await run(buildConfig.cmd, buildConfig.args, {
      cwd: resolved.path,
      env,
    });
    built.push(resolved.key);
  }

  return { built, skipped };
}

export default createPlugin({
  variables: z.object({
    configPath: z.string().optional(),
  }),
  secrets: z.object({}),
  contract: bosContract,
  initialize: (config: any) =>
    Effect.promise(async () => {
      const configResult = await loadConfig({ path: config.variables.configPath });
      return {
        bosConfig: configResult?.config ?? null,
        runtimeConfig: configResult?.runtime ?? null,
        configDir: getProjectRoot(),
      } satisfies BosDeps;
    }),
  shutdown: () => Effect.void,
  createRouter: (deps: BosDeps, builder: any) => ({
    config: builder.config.handler(async () => buildConfigResult(deps.bosConfig)),

    pluginAdd: builder.pluginAdd.handler(async ({ input }: { input: PluginAddOptions }) => {
      if (!deps.bosConfig) {
        return {
          status: "error" as const,
          key: "",
          error: "No bos.config.json found",
        };
      }

      const pluginRef = parsePluginBosUrl(input.source);
      let production = input.production ?? input.source;
      let integrity: string | undefined;
      let version: string | undefined;
      let name: string | undefined;

      if (pluginRef) {
        try {
          const entry = await fetchPluginFromRegistry(pluginRef.accountId, pluginRef.pluginName);
          if (!entry) {
            return {
              status: "error" as const,
              key: "",
              error: `Plugin not found in registry: bos://${pluginRef.accountId}/plugins/${pluginRef.pluginName}`,
            };
          }

          const manifest = entry.manifest;
          if (
            manifest.schemaVersion !== 1 ||
            manifest.kind !== "every-plugin/manifest" ||
            !manifest.plugin?.name ||
            !manifest.plugin?.version ||
            !manifest.runtime?.remoteEntry
          ) {
            return {
              status: "error" as const,
              key: "",
              error: `Invalid plugin manifest for bos://${pluginRef.accountId}/plugins/${pluginRef.pluginName}`,
            };
          }

          production = entry.metadata.cdnUrl || input.production || input.source;
          name = manifest.plugin.name;
          version = manifest.plugin.version;
        } catch (error) {
          return {
            status: "error" as const,
            key: "",
            error: `Failed to resolve plugin from registry: ${error instanceof Error ? error.message : error}`,
          };
        }
      }

      if (!input.source.startsWith("local:") && !pluginRef && production.startsWith("https://")) {
        try {
          const manifest = await fetchRemotePluginManifest(production);
          if (manifest) {
            name = manifest.plugin.name;
            version = manifest.plugin.version;
          }
        } catch {
          console.warn(`[plugin add] Could not fetch manifest from ${production}`);
        }
      }

      if (!input.source.startsWith("local:") && production.startsWith("https://")) {
        try {
          const computed = await computeSriHashForUrl(production);
          if (computed) integrity = computed;
        } catch {
          console.warn(`[plugin add] Could not compute integrity for ${production}`);
        }
      }

      const key = sanitizePluginKey(
        input.as ?? (pluginRef ? pluginRef.pluginName : defaultPluginKey(input.source)),
      );
      const existing = deps.bosConfig.plugins?.[key];
      const nextPlugins = { ...(deps.bosConfig.plugins ?? {}) };

      nextPlugins[key] = input.source.startsWith("local:")
        ? {
            ...(existing ?? {}),
            development: input.source,
            production: input.production ?? existing?.production,
          }
        : {
            ...(existing ?? {}),
            production,
            ...(integrity ? { integrity } : {}),
            ...(name ? { name } : {}),
            ...(version ? { version } : {}),
          };

      deps.bosConfig = {
        ...deps.bosConfig,
        plugins: nextPlugins,
      };

      await saveBosConfig(deps.configDir, deps.bosConfig);
      await refreshApiContractBridge(deps.configDir);

      return {
        status: "added" as const,
        key,
        development: deps.bosConfig.plugins?.[key]?.development,
        production: deps.bosConfig.plugins?.[key]?.production,
        integrity,
        version,
      };
    }),

    pluginRemove: builder.pluginRemove.handler(
      async ({ input }: { input: PluginRemoveOptions }) => {
        if (!deps.bosConfig) {
          return {
            status: "error" as const,
            key: input.key,
            error: "No bos.config.json found",
          };
        }

        if (!deps.bosConfig.plugins?.[input.key]) {
          return {
            status: "error" as const,
            key: input.key,
            error: `Plugin '${input.key}' is not configured`,
          };
        }

        const nextPlugins = { ...(deps.bosConfig.plugins ?? {}) };
        delete nextPlugins[input.key];
        deps.bosConfig = {
          ...deps.bosConfig,
          plugins: Object.keys(nextPlugins).length > 0 ? nextPlugins : undefined,
        };

        await saveBosConfig(deps.configDir, deps.bosConfig);
        await refreshApiContractBridge(deps.configDir);

        return {
          status: "removed" as const,
          key: input.key,
        };
      },
    ),

    pluginList: builder.pluginList.handler(async () => {
      const plugins: PluginListResult["plugins"] = listPluginAttachments(deps.bosConfig);
      return {
        status: "listed" as const,
        plugins,
      };
    }),

    pluginPublish: builder.pluginPublish.handler(
      async ({ input }: { input: PluginPublishOptions }) => {
        if (!deps.bosConfig) {
          return {
            status: "error" as const,
            key: input.key,
            error: "No bos.config.json found",
          };
        }

        const attachment = deps.bosConfig.plugins?.[input.key];
        if (!attachment) {
          return {
            status: "error" as const,
            key: input.key,
            error: `Plugin '${input.key}' is not configured`,
          };
        }

        const localPath = pluginLocalPath(deps.configDir, attachment);
        if (!localPath) {
          return {
            status: "error" as const,
            key: input.key,
            error: `Plugin '${input.key}' does not have a local development path`,
          };
        }

        const pkgPath = join(localPath, "package.json");
        if (!(await Bun.file(pkgPath).exists())) {
          return {
            status: "error" as const,
            key: input.key,
            error: `Missing package.json at ${localPath}`,
          };
        }

        const pkgJson = (await Bun.file(pkgPath).json()) as {
          scripts?: Record<string, string>;
          name?: string;
          version?: string;
        };
        const script = pkgJson.scripts?.deploy ? "deploy" : "build";

        const { stdout, stderr, exitCode } = (await run("bun", ["run", script], {
          cwd: localPath,
          capture: true,
        })) as { stdout: string; stderr: string; exitCode: number };

        if (exitCode !== 0) {
          if (stdout.trim()) process.stdout.write(stdout);
          if (stderr.trim()) process.stderr.write(stderr);
          return {
            status: "error" as const,
            key: input.key,
            error: `Publish failed with exit code ${exitCode}`,
          };
        }

        if (stdout.trim()) process.stdout.write(stdout);
        if (stderr.trim()) process.stderr.write(stderr);

        let publishedUrl = extractPublishedUrl(`${stdout}\n${stderr}`);

        let manifest: PluginManifest | null = null;
        if (publishedUrl) {
          manifest = await fetchRemotePluginManifest(publishedUrl);
        } else if (attachment.production) {
          manifest = await fetchRemotePluginManifest(attachment.production);
          if (manifest) {
            publishedUrl = attachment.production;
          }
        }

        const integrity = publishedUrl ? await computeSriHashForUrl(publishedUrl) : null;
        const version = manifest?.plugin.version ?? pkgJson.version;

        if (publishedUrl) {
          deps.bosConfig = {
            ...deps.bosConfig,
            plugins: {
              ...(deps.bosConfig.plugins ?? {}),
              [input.key]: {
                ...(deps.bosConfig.plugins?.[input.key] ?? {}),
                production: publishedUrl,
                ...(integrity ? { integrity } : {}),
                ...(manifest?.plugin.name ? { name: manifest.plugin.name } : {}),
                ...(version ? { version } : {}),
              },
            },
          };
          await saveBosConfig(deps.configDir, deps.bosConfig);

          const account = deps.bosConfig.account;
          const network = getNetworkIdForAccount(account);
          if (manifest && version) {
            try {
              const registryEntries: Record<string, string> = {
                [`plugins/${account}/${input.key}/manifest.json`]: JSON.stringify(manifest),
                [`plugins/${account}/${input.key}/metadata`]: JSON.stringify({
                  title: null,
                  description: null,
                  repoUrl: deps.bosConfig.repository ?? null,
                  version,
                  publishedAt: new Date().toISOString(),
                  cdnUrl: publishedUrl,
                  integrity,
                }),
                [`plugins/${account}/${input.key}/versions/${version}/manifest.json`]:
                  JSON.stringify(manifest),
              };
              const payload = JSON.stringify(registryEntries);
              const argsBase64 = Buffer.from(payload).toString("base64");
              const privateKey = process.env.NEAR_PRIVATE_KEY || process.env.BOS_NEAR_PRIVATE_KEY;

              await Effect.runPromise(ensureNearCli);
              try {
                await Effect.runPromise(
                  executeTransaction({
                    account,
                    contract: getRegistryNamespaceForNetwork(network),
                    method: "__fastdata_kv",
                    argsBase64,
                    network,
                    privateKey,
                    gas: "50Tgas",
                    deposit: "0NEAR",
                  }),
                );
              } catch (registryError) {
                const txHash = extractTransactionHash(registryError);
                if (!txHash) {
                  console.warn(
                    `[publish] Plugin registry write failed: ${registryError instanceof Error ? registryError.message : registryError}`,
                  );
                }
              }
            } catch (registryError) {
              console.warn(
                `[publish] Plugin registry write skipped: ${registryError instanceof Error ? registryError.message : registryError}`,
              );
            }
          }

          await refreshApiContractBridge(deps.configDir);
        }

        return {
          status: "published" as const,
          key: input.key,
          path: localPath,
          script,
          production: publishedUrl ?? attachment.production,
          integrity: integrity ?? undefined,
          version: version ?? undefined,
        };
      },
    ),

    dev: builder.dev.handler(async ({ input }: { input: DevOptions }) => {
      ensureEnvFile(deps.configDir);

      const localPackages = detectLocalPackages(
        deps.bosConfig ?? undefined,
        deps.runtimeConfig ?? undefined,
      );

      const hostSource: SourceMode = localPackages.includes("host")
        ? parseSourceMode(input.host as string, "local")
        : "remote";
      const uiSource: SourceMode = localPackages.includes("ui")
        ? parseSourceMode(input.ui as string, "local")
        : "remote";
      const apiSource: SourceMode = localPackages.includes("api")
        ? parseSourceMode(input.api as string, "local")
        : "remote";
      const authSource: SourceMode = localPackages.includes("auth")
        ? parseSourceMode(input.auth as string, "local")
        : "remote";
      const ssr = input.ssr ?? false;
      const proxy = input.proxy ?? false;

      const sharedSync = await syncAndGenerateSharedUi({
        configDir: deps.configDir,
        hostMode: hostSource,
        bosConfig: deps.bosConfig ?? undefined,
      });
      if (sharedSync.catalogChanged) {
        await run("bun", ["install"], { cwd: deps.configDir });
      }
      if (
        (apiSource === "local" && !proxy) ||
        localPackages.some((pkg) => pkg.startsWith("plugin:"))
      ) {
        await buildEveryPluginQuietly(deps.configDir);
      }

      await buildEverythingDevQuietly(deps.configDir);

      const refreshed = await loadConfig({ cwd: deps.configDir });
      deps.bosConfig = refreshed?.config ?? deps.bosConfig;
      deps.runtimeConfig = refreshed?.runtime ?? deps.runtimeConfig;

      if (!deps.bosConfig) {
        return {
          status: "error" as const,
          description: "No bos.config.json found",
          processes: [],
        };
      }

      if (proxy && !resolveProxyUrl(deps.bosConfig)) {
        return {
          status: "error" as const,
          description: "No valid proxy URL configured in bos.config.json",
          processes: [],
        };
      }

      const hostPort = input.port ?? getHostDevelopmentPort(deps.bosConfig.app.host.development);
      const developmentRuntime = buildRuntimeConfig(deps.bosConfig, {
        uiSource,
        apiSource,
        authSource,
        hostSource,
        env: "development",
        plugins: deps.runtimeConfig?.plugins,
      });
      const runtimeConfig = await prepareDevelopmentRuntimeConfig(developmentRuntime, {
        hostPort,
        ssr,
      });

      const services = buildServiceDescriptorMap(runtimeConfig, { ssr, proxy });
      const packages = [...services.keys()];
      const displayEnv: Record<string, string> = {};
      const apiDescriptor = services.get("api");
      if (apiDescriptor?.proxy) {
        const proxyUrl = resolveProxyUrl(deps.bosConfig);
        if (proxyUrl) displayEnv.API_PROXY = proxyUrl;
      }

      await syncApiContractBridge({
        configDir: deps.configDir,
        runtimeConfig: runtimeConfig,
        apiBaseUrl: runtimeConfig.api.url,
      });

      const orchestrator: AppOrchestrator = {
        packages,
        env: displayEnv,
        description: buildDescription(services),
        port: runtimeConfig.host.port,
        interactive: input.interactive,
      };

      devApp(orchestrator, services, runtimeConfig);

      return {
        status: "started" as const,
        description: orchestrator.description,
        processes: packages,
      };
    }),

    start: builder.start.handler(async ({ input }: { input: StartOptions }) => {
      ensureEnvFile(deps.configDir);

      let remoteConfig: BosConfig | null = null;

      if (input.account && input.domain) {
        remoteConfig = await fetchPublishedConfig(input.account, input.domain);
        if (!remoteConfig) {
          return {
            status: "error" as const,
            url: "",
          };
        }
      }

      const config = remoteConfig || deps.bosConfig;
      if (!config) {
        return {
          status: "error" as const,
          url: "",
        };
      }

      const port = input.port ?? getHostDevelopmentPort(config.app.host.development);
      const isStaging = input.env === "staging";
      const runtimePlugins = remoteConfig
        ? await buildRuntimePluginsForConfig(config, deps.configDir, "production")
        : deps.runtimeConfig?.plugins;
      const runtimeConfig = buildRuntimeConfig(config, {
        uiSource: "remote",
        apiSource: "remote",
        authSource: "remote",
        hostSource: "remote",
        env: "production",
        plugins: runtimePlugins,
      });

      // ── Production Readiness Validation ──
      const productionEnv: Record<string, string> = {};
      const warnings: string[] = [];

      // Default CORS_ORIGIN to the configured domain if not set
      if (!process.env.CORS_ORIGIN && config.domain) {
        const defaultOrigin = `https://${config.domain}`;
        productionEnv.CORS_ORIGIN = defaultOrigin;
        warnings.push(`CORS_ORIGIN defaulting to ${defaultOrigin}`);
      }

      // Validate required secrets
      const requiredSecrets = new Set<string>();
      const missingSecrets: string[] = [];

      if (runtimeConfig.auth?.secrets) {
        for (const s of runtimeConfig.auth.secrets) requiredSecrets.add(s);
      }
      if (runtimeConfig.api?.secrets) {
        for (const s of runtimeConfig.api.secrets) requiredSecrets.add(s);
      }
      for (const plugin of Object.values(runtimeConfig.plugins ?? {})) {
        if (plugin.secrets) {
          for (const s of plugin.secrets) requiredSecrets.add(s);
        }
      }

      for (const secret of requiredSecrets) {
        const value = process.env[secret];
        if (!value || value.length === 0) {
          missingSecrets.push(secret);
        }
      }

      if (missingSecrets.length > 0) {
        warnings.push(`Missing ${missingSecrets.length} secret(s): ${missingSecrets.join(", ")}`);
      }

      const services = buildServiceDescriptorMap(runtimeConfig);

      await syncApiContractBridge({
        configDir: deps.configDir,
        runtimeConfig: runtimeConfig,
        apiBaseUrl: runtimeConfig.api.url,
      });

      const stagingEnvVars: Record<string, string> = isStaging
        ? { GATEWAY_DOMAIN: config.staging?.domain ?? config.domain ?? "" }
        : {};

      const configSource = remoteConfig
        ? `bos://${input.account}/${input.domain}`
        : (findConfigPath() ?? "bos.config.json");

      const configSourceHttp =
        remoteConfig && input.account && input.domain
          ? buildRegistryConfigUrl(input.account, input.domain)
          : undefined;

      const summaryLines: string[] = ["", `  ${colors.dim("Config Source:")}  ${configSource}`];
      if (configSourceHttp) {
        summaryLines.push(`                  ${colors.dim(configSourceHttp)}`);
      }
      summaryLines.push(
        `  ${colors.dim("Account:")}        ${config.account}`,
        `  ${colors.dim("Domain:")}         ${config.domain ?? "not configured"}`,
        "",
        `  ${colors.dim("Modules:")}`,
        `    ${colors.dim("HOST")}  → ${runtimeConfig.host.remoteUrl ?? runtimeConfig.host.url ?? "local"}`,
        `    ${colors.dim("UI")}   → ${runtimeConfig.ui.url ?? "local"}`,
        `    ${colors.dim("API")}  → ${runtimeConfig.api.url ?? "local"}`,
      );
      if (runtimeConfig.auth) {
        summaryLines.push(`    ${colors.dim("AUTH")}  → ${runtimeConfig.auth.url ?? "local"}`);
      }
      if (warnings.length > 0) {
        summaryLines.push("");
        for (const w of warnings) {
          summaryLines.push(`  ${colors.yellow(w)}`);
        }
      }
      summaryLines.push("");
      console.log(summaryLines.join("\n"));

      const orchestrator: AppOrchestrator = {
        packages: ["host"],
        env: {
          NODE_ENV: "production",
          ...productionEnv,
          ...stagingEnvVars,
        },
        description: `${isStaging ? "Staging" : "Production"} Mode (${config.account})`,
        port,
        interactive: input.interactive,
        noLogs: true,
      };

      startApp(orchestrator, services, runtimeConfig);
      return {
        status: "running" as const,
        url: `http://localhost:${port}`,
      };
    }),

    build: builder.build.handler(async ({ input }: { input: BuildOptions }) => {
      if (!deps.bosConfig) {
        return {
          status: "error" as const,
          built: [],
          skipped: [],
        };
      }

      const targets = selectWorkspaceTargets(input.packages, deps.bosConfig);
      if (targets.length === 0) {
        return {
          status: "error" as const,
          built: [],
          skipped: [],
        };
      }

      const runtimeConfig = buildRuntimeConfig(deps.bosConfig, {
        uiSource: deps.bosConfig.app.ui?.development ? "local" : "remote",
        apiSource: deps.bosConfig.app.api?.development ? "local" : "remote",
        authSource: deps.bosConfig.app.auth?.development ? "local" : "remote",
        hostSource: deps.bosConfig.app.host?.development ? "local" : "remote",
        env: "development",
        plugins: deps.runtimeConfig?.plugins,
      });

      await syncApiContractBridge({
        configDir: deps.configDir,
        runtimeConfig,
        apiBaseUrl: runtimeConfig.api.url,
      });

      const { built, skipped } = await buildWorkspaceTargets({
        configDir: deps.configDir,
        bosConfig: deps.bosConfig,
        runtimeConfig: runtimeConfig,
        targets,
        deploy: input.deploy,
      });

      if (built.length === 0) {
        return {
          status: "error" as const,
          built: [],
          skipped,
        };
      }

      return {
        status: "success" as const,
        built,
        skipped,
        deployed: input.deploy,
      };
    }),

    publish: builder.publish.handler(async ({ input }: { input: PublishOptions }) => {
      if (!deps.bosConfig) {
        return {
          status: "error" as const,
          registryUrl: "",
          error: "No bos.config.json found",
        };
      }

      const account = deps.bosConfig.account;
      const gateway = deps.bosConfig.domain;
      if (!gateway) {
        return {
          status: "error" as const,
          registryUrl: "",
          error: "bos.config.json must define domain to publish",
        };
      }

      const network = input.network ?? getNetworkIdForAccount(account);
      const bosUrl = `bos://${account}/${gateway}`;
      const registryUrl = buildRegistryConfigUrlForNetwork(network, account, gateway);
      const targets = selectWorkspaceTargets(input.packages, deps.bosConfig);

      let publishConfig = deps.bosConfig;
      let built: string[] | undefined;
      let skipped: string[] | undefined;

      if (input.dryRun) {
        return {
          status: "dry-run" as const,
          registryUrl,
          built,
          skipped,
        };
      }

      if (input.deploy) {
        const result = await buildWorkspaceTargets({
          configDir: deps.configDir,
          bosConfig: deps.bosConfig,
          runtimeConfig: deps.runtimeConfig,
          targets,
          deploy: true,
        });
        built = result.built;
        skipped = result.skipped;

        const refreshed = await loadConfig({ cwd: deps.configDir });
        if (refreshed?.config) {
          deps.bosConfig = refreshed.config;
          deps.runtimeConfig = refreshed.runtime;
          publishConfig = refreshed.config;
        }
      }

      const payload = JSON.stringify({
        [`apps/${account}/${gateway}/bos.config.json`]: JSON.stringify(publishConfig),
      });
      const argsBase64 = Buffer.from(payload).toString("base64");
      const privateKey =
        input.privateKey || process.env.NEAR_PRIVATE_KEY || process.env.BOS_NEAR_PRIVATE_KEY;

      try {
        await Effect.runPromise(ensureNearCli);
        let txHash: string | undefined;

        try {
          const tx = await Effect.runPromise(
            executeTransaction({
              account,
              contract: getRegistryNamespaceForNetwork(network),
              method: "__fastdata_kv",
              argsBase64,
              network,
              privateKey,
              gas: "300Tgas",
              deposit: "0NEAR",
            }),
          );
          txHash = tx.txHash;
        } catch (error) {
          txHash = extractTransactionHash(error);

          if (!txHash) {
            throw error;
          }

          try {
            const verifiedConfig = await fetchBosConfigFromFastKv<BosConfig>(bosUrl);
            if (JSON.stringify(verifiedConfig) !== JSON.stringify(publishConfig)) {
              throw error;
            }
          } catch {
            // Config may not exist yet on first publish or propagation delay;
            // a valid txHash is sufficient proof the transaction was submitted.
          }
        }

        return {
          status: "published" as const,
          registryUrl,
          txHash,
          built,
          skipped,
        };
      } catch (error) {
        return {
          status: "error" as const,
          registryUrl,
          error: error instanceof Error ? error.message : "Unknown error",
          built,
          skipped,
        };
      }
    }),

    keyPublish: builder.keyPublish.handler(async ({ input }: { input: KeyPublishOptions }) => {
      if (!deps.bosConfig) {
        return {
          status: "error" as const,
          account: "",
          network: "mainnet" as const,
          contract: "",
          allowance: input.allowance,
          functionNames: PUBLISH_FUNCTION_NAMES,
          error: "No bos.config.json found",
        };
      }

      const account = deps.bosConfig.account;
      const network = getNetworkIdForAccount(account);
      const contract = getRegistryNamespaceForAccount(account);
      try {
        await Effect.runPromise(ensureNearCli);
        const keyPair = await addFunctionCallAccessKey({
          account,
          contract,
          allowance: input.allowance,
          functionNames: PUBLISH_FUNCTION_NAMES,
          network,
        });

        return {
          status: "published" as const,
          account,
          network,
          contract,
          allowance: input.allowance,
          functionNames: PUBLISH_FUNCTION_NAMES,
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
        };
      } catch (error) {
        return {
          status: "error" as const,
          account,
          network,
          contract,
          allowance: input.allowance,
          functionNames: PUBLISH_FUNCTION_NAMES,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    init: builder.init.handler(async ({ input }: { input: InitOptions }) => {
      try {
        let extendsAccount = input.extendsAccount;
        let extendsGateway = input.extendsGateway;
        let directory = input.directory;
        let account = input.account;
        let domain = input.domain;
        let withHost = input.withHost;
        let plugins = input.plugins;

        if (input.extends) {
          const match = input.extends.match(/^(?:bos:\/\/)?([^/]+)\/(.+)$/);
          if (match) {
            if (!extendsAccount) extendsAccount = match[1];
            if (!extendsGateway) extendsGateway = match[2];
          }
        }

        if (!input.noInteractive) {
          const prompted = await promptInitOptions({
            extendsAccount,
            extendsGateway,
            extends: input.extends,
            directory,
            account,
            domain,
            plugins,
            withHost,
          });
          extendsAccount = prompted.extendsAccount;
          extendsGateway = prompted.extendsGateway;
          directory = prompted.directory;
          account = prompted.account;
          domain = prompted.domain;
          withHost = prompted.withHost;
          plugins = prompted.plugins;
        }

        extendsAccount = extendsAccount || "dev.everything.near";
        extendsGateway = extendsGateway || "everything.dev";
        directory = directory || domain || extendsGateway;
        plugins = plugins?.length ? plugins : ["_template"];

        try {
          await fetchParentConfig(extendsAccount, extendsGateway);
        } catch {
          return {
            status: "error" as const,
            directory,
            extendsAccount,
            extendsGateway,
            account,
            domain,
            extends: `bos://${extendsAccount}/${extendsGateway}`,
            plugins: plugins ?? [],
            filesCopied: 0,
            error: `No config found at bos://${extendsAccount}/${extendsGateway} — are you sure this is the right parent?`,
          };
        }

        const { sourceDir, parentConfig, cleanup } = await resolveSourceDir({
          extendsAccount,
          extendsGateway,
          source: input.source,
        });

        try {
          const patterns = await readTemplatekeep(sourceDir);
          if (patterns.length === 0) {
            return {
              status: "error" as const,
              directory,
              extendsAccount,
              extendsGateway,
              account,
              domain,
              extends: `bos://${extendsAccount}/${extendsGateway}`,
              plugins: plugins ?? [],
              filesCopied: 0,
              error: "No .templatekeep found in template source",
            };
          }

          const pluginRoutes: Record<string, string[]> = {};
          if (parentConfig.plugins) {
            for (const [key, ref] of Object.entries(parentConfig.plugins)) {
              if (ref.routes && ref.routes.length > 0) {
                pluginRoutes[key] = ref.routes;
              }
            }
          }

          const s = p.spinner();
          s.start("Setting up project");

          const filesCopied = await copyFilteredFiles(sourceDir, directory, patterns, {
            withHost,
            plugins,
            pluginRoutes,
          });

          await personalizeConfig(directory, {
            extendsAccount,
            extendsGateway,
            account: account || extendsAccount,
            domain: domain || extendsGateway,
            plugins,
            pluginRoutes,
            workspaceOpts: { sourceDir },
            withHost,
          });

          await writeInitSnapshot(directory, extendsAccount, extendsGateway, sourceDir, patterns, {
            withHost,
            plugins,
            pluginRoutes,
          });

          if (!input.noInstall) {
            await runBunInstall(directory);
          }

          ensureEnvFile(directory);

          s.stop("Project initialized");

          return {
            status: "initialized" as const,
            directory,
            extendsAccount,
            extendsGateway,
            account,
            domain,
            extends: `bos://${extendsAccount}/${extendsGateway}`,
            plugins,
            filesCopied,
          };
        } finally {
          await cleanup();
        }
      } catch (error) {
        return {
          status: "error" as const,
          directory: input.directory ?? "",
          extendsAccount: input.extendsAccount ?? "",
          extendsGateway: input.extendsGateway ?? "",
          account: input.account,
          domain: input.domain,
          extends:
            input.extendsAccount && input.extendsGateway
              ? `bos://${input.extendsAccount}/${input.extendsGateway}`
              : "",
          plugins: input.plugins ?? [],
          filesCopied: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    sync: builder.sync.handler(async ({ input }: { input: SyncOptions }) => {
      try {
        const configPath = findConfigPath();
        if (!configPath) {
          return {
            status: "error" as const,
            updated: [],
            skipped: [],
            added: [],
            error: "No bos.config.json found in current directory",
          };
        }

        const projectDir = resolve(dirname(configPath));
        return await syncTemplate(projectDir, input);
      } catch (error) {
        return {
          status: "error" as const,
          updated: [],
          skipped: [],
          added: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    upgrade: builder.upgrade.handler(async ({ input }: { input: UpgradeOptions }) => {
      try {
        const configPath = findConfigPath();
        if (!configPath) {
          return {
            status: "error" as const,
            packages: [],
            error: "No bos.config.json found in current directory",
          };
        }

        const projectDir = resolve(dirname(configPath));
        return await upgradeTemplate(projectDir, input);
      } catch (error) {
        return {
          status: "error" as const,
          packages: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    typesGen: builder.typesGen.handler(async ({ input }: { input: TypesGenOptions }) => {
      try {
        const configPath = findConfigPath();
        if (!configPath) {
          return {
            status: "error" as const,
            generated: [],
            fetched: [],
            skipped: [],
            failed: [],
            error: "No bos.config.json found in current directory",
          };
        }

        const projectDir = resolve(dirname(configPath));
        const env =
          input.env ??
          (process.env.NODE_ENV === "production" ? "production" : "development");

        const refreshed = await loadConfig({ cwd: projectDir, env });
        if (!refreshed) {
          return {
            status: "error" as const,
            generated: [],
            fetched: [],
            skipped: [],
            failed: [],
            error: "Failed to load bos.config.json",
          };
        }

        if (input.dryRun) {
          const pluginEntries = Object.entries(refreshed.runtime.plugins ?? {});
          const fetched: string[] = [];
          const skipped: string[] = [];

          if (refreshed.runtime.api.source !== "local") {
            fetched.push(refreshed.runtime.api.url);
          } else {
            skipped.push("api (local)");
          }

          if (refreshed.runtime.auth) {
            if (refreshed.runtime.auth.source !== "local") {
              fetched.push(refreshed.runtime.auth.url);
            } else {
              skipped.push("auth (local)");
            }
          }

          for (const [key, plugin] of pluginEntries) {
            if (plugin.url && plugin.source !== "local") {
              fetched.push(plugin.url);
            } else if (plugin.localPath) {
              skipped.push(`${key} (local)`);
            }
          }

          return {
            status: "success" as const,
            generated: [
              "ui/src/api-contract.gen.ts",
              "ui/src/auth-types.gen.ts",
              "api/src/plugins-client.gen.ts",
              "api/src/auth-client.gen.ts",
            ],
            fetched,
            skipped,
            failed: [],
            source: refreshed.runtime.api.source,
          };
        }

        const result = await syncApiContractBridge({
          configDir: projectDir,
          runtimeConfig: refreshed.runtime,
          apiBaseUrl: refreshed.runtime.api.url,
        });

        const generated = [
          "ui/src/api-contract.gen.ts",
          "api/src/plugins-client.gen.ts",
          "api/src/auth-client.gen.ts",
        ];
        if (
          refreshed.runtime.auth &&
          (refreshed.runtime.auth.source !== "local" || refreshed.runtime.auth.localPath)
        ) {
          generated.push("ui/src/auth-types.gen.ts");
        }

        return {
          status: "success" as const,
          generated,
          fetched: result.source === "remote" ? [refreshed.runtime.api.url] : [],
          skipped: result.source === "local" ? ["api (local)"] : [],
          failed: [],
          source: result.source,
        };
      } catch (error) {
        return {
          status: "error" as const,
          generated: [],
          fetched: [],
          skipped: [],
          failed: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    status: builder.status.handler(async () => {
      try {
        const configPath = findConfigPath();
        if (!configPath) {
          return {
            status: "error" as const,
            packages: [],
            envFile: "missing" as const,
            error: "No bos.config.json found in current directory",
          };
        }

        const projectDir = resolve(dirname(configPath));
        return await getStatus(projectDir);
      } catch (error) {
        return {
          status: "error" as const,
          packages: [],
          envFile: "missing" as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
  }),
});

function extractTransactionHash(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match =
    message.match(/Transaction ID:\s*([A-Za-z0-9]+)/i) ||
    message.match(/([A-HJ-NP-Za-km-z1-9]{43,44})/);

  return match?.[1];
}
