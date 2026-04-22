import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { RuntimeConfig, RuntimePluginConfig } from "./types";

export interface ApiPluginManifest {
  schemaVersion: 1;
  kind: "every-plugin/manifest";
  plugin: {
    name: string;
    version: string;
  };
  runtime: {
    remoteEntry: string;
  };
  contract?: {
    kind: "orpc";
    types: {
      path: string;
      exportName: string;
      typeName: string;
      sha256?: string;
    };
  };
}

interface ContractSource {
  key: string;
  importName: string;
  sourceFilePath: string;
  generatedPath?: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function trimTrailingSlash(input: string): string {
  return input.replace(/\/$/, "");
}

function sanitizeIdentifier(input: string): string {
  return input.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]+/, "_");
}

function toImportPath(fromFile: string, targetFile: string): string {
  const rel = relative(dirname(fromFile), targetFile).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function writeFileIfChanged(filePath: string, content: string) {
  try {
    if (readFileSync(filePath, "utf8") === content) return false;
  } catch {
    // file does not exist yet
  }

  writeFileSync(filePath, content);
  return true;
}

function getApiPluginManifestUrl(apiBaseUrl: string): string {
  return `${trimTrailingSlash(apiBaseUrl)}/plugin.manifest.json`;
}

async function fetchApiPluginManifest(apiBaseUrl: string): Promise<ApiPluginManifest> {
  const response = await fetch(getApiPluginManifestUrl(apiBaseUrl));
  if (!response.ok) {
    throw new Error(
      `Failed to fetch API plugin manifest: ${response.status} ${response.statusText}`,
    );
  }

  const manifest = (await response.json()) as ApiPluginManifest;
  if (manifest.schemaVersion !== 1 || manifest.kind !== "every-plugin/manifest") {
    throw new Error("Unsupported API plugin manifest format");
  }

  return manifest;
}

function localApiContractSource(configDir: string): ContractSource {
  const sourcePath = join(configDir, "api", "src", "contract.ts");
  return {
    key: "api",
    importName: "BaseApiContract",
    sourceFilePath: sourcePath,
  };
}

async function remoteContractSource(opts: {
  configDir: string;
  runtimeDir: string;
  name: string;
  baseUrl: string;
  generatedSubdir: string;
}): Promise<ContractSource> {
  const manifest = await fetchApiPluginManifest(opts.baseUrl);
  if (!manifest.contract) {
    throw new Error(
      `Plugin manifest for ${manifest.plugin.name} does not advertise contract types`,
    );
  }

  const contractUrl = `${trimTrailingSlash(opts.baseUrl)}/${manifest.contract.types.path.replace(/^\.\//, "")}`;
  const contractResponse = await fetch(contractUrl);
  if (!contractResponse.ok) {
    throw new Error(
      `Failed to fetch contract types: ${contractResponse.status} ${contractResponse.statusText}`,
    );
  }

  const contractTypes = await contractResponse.text();
  if (manifest.contract.types.sha256 && manifest.contract.types.sha256 !== sha256(contractTypes)) {
    throw new Error("Fetched contract types failed checksum verification");
  }

  const generatedPath = join(opts.runtimeDir, opts.generatedSubdir, "contract.d.ts");
  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileIfChanged(generatedPath, contractTypes);

  return {
    key: opts.name,
    importName: `${sanitizeIdentifier(opts.name)}Contract`,
    sourceFilePath: generatedPath,
    generatedPath,
  };
}

async function resolveContractSource(opts: {
  configDir: string;
  runtimeDir: string;
  key: string;
  source: RuntimePluginConfig | { url: string; localPath?: string; name: string } | null;
  baseUrl: string;
  generatedSubdir: string;
}): Promise<ContractSource> {
  if (
    opts.key === "api" &&
    (!opts.source || !("localPath" in opts.source) || opts.source.localPath)
  ) {
    const localPath = opts.source && "localPath" in opts.source ? opts.source.localPath : undefined;
    if (localPath) {
      return {
        key: opts.key,
        importName: "BaseApiContract",
        sourceFilePath: join(localPath, "src", "contract.ts"),
      };
    }

    if (!opts.baseUrl) {
      return localApiContractSource(opts.configDir);
    }
  }

  if (opts.source && "localPath" in opts.source && opts.source.localPath) {
    return {
      key: opts.key,
      importName: `${sanitizeIdentifier(opts.key)}Contract`,
      sourceFilePath: join(opts.source.localPath, "src", "contract.ts"),
    };
  }

  return remoteContractSource({
    configDir: opts.configDir,
    runtimeDir: opts.runtimeDir,
    name: opts.key,
    baseUrl: opts.baseUrl,
    generatedSubdir: opts.generatedSubdir,
  });
}

function writeAggregateContractFile(opts: {
  configDir: string;
  sources: ContractSource[];
  pluginKeys: string[];
}) {
  const baseSource = opts.sources.find((source) => source.key === "api");
  const pluginSources = opts.pluginKeys
    .map((key) => opts.sources.find((entry) => entry.key === key))
    .filter((source): source is ContractSource => Boolean(source));

  if (!baseSource) {
    throw new Error("API contract source is required to generate the aggregate contract");
  }

  // --- Generate ui/src/api-contract.gen.ts ---
  const uiContractPath = join(opts.configDir, "ui", "src", "api-contract.gen.ts");
  const uiLines: string[] = [];

  for (const source of opts.sources) {
    const importPath = toImportPath(uiContractPath, source.sourceFilePath);
    uiLines.push(`import type { ContractType as ${source.importName} } from "${importPath}";`);
  }

  uiLines.push("");
  if (pluginSources.length === 0) {
    uiLines.push(`export type ApiContract = ${baseSource.importName};`);
  } else {
    uiLines.push(`export type ApiContract = ${baseSource.importName} & {`);
    for (const source of pluginSources) {
      const key = /^[$A-Z_][0-9A-Z_$]*$/i.test(source.key)
        ? source.key
        : JSON.stringify(source.key);
      uiLines.push(`  ${key}: ${source.importName};`);
    }
    uiLines.push("};");
  }
  mkdirSync(dirname(uiContractPath), { recursive: true });
  writeFileIfChanged(uiContractPath, `${uiLines.join("\n")}\n`);

  // --- Generate api/src/plugins-client.gen.ts ---
  const pluginsClientPath = join(opts.configDir, "api", "src", "plugins-client.gen.ts");
  const pluginsClientLines: string[] = [];

  for (const source of pluginSources) {
    const importPath = toImportPath(pluginsClientPath, source.sourceFilePath);
    pluginsClientLines.push(
      `import type { ContractType as ${source.importName} } from "${importPath}";`,
    );
  }

  pluginsClientLines.push(
    'import type { ContractRouterClient, AnyContractRouter } from "@orpc/contract";',
  );
  pluginsClientLines.push(
    "type ClientFactory<C extends AnyContractRouter> = (context?: Record<string, unknown>) => ContractRouterClient<C>;",
  );
  pluginsClientLines.push("");

  if (pluginSources.length === 0) {
    pluginsClientLines.push("export type PluginsClient = Record<string, never>;");
  } else {
    pluginsClientLines.push("export type PluginsClient = {");
    for (const source of pluginSources) {
      const key = /^[$A-Z_][0-9A-Z_$]*$/i.test(source.key)
        ? source.key
        : JSON.stringify(source.key);
      pluginsClientLines.push(`  ${key}: ClientFactory<${source.importName}>;`);
    }
    pluginsClientLines.push("};");
  }

  mkdirSync(dirname(pluginsClientPath), { recursive: true });
  writeFileIfChanged(pluginsClientPath, `${pluginsClientLines.join("\n")}\n`);

  return uiContractPath;
}

export async function syncApiContractBridge(opts: {
  configDir: string;
  runtimeConfig: RuntimeConfig;
  apiBaseUrl: string;
}): Promise<{
  bridgePath: string;
  generatedPath: string | null;
  manifest: ApiPluginManifest | null;
  source: "local" | "remote";
}> {
  const runtimeDir = join(opts.configDir, ".bos", "generated");
  const pluginEntries = Object.entries(opts.runtimeConfig.plugins ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const sources: ContractSource[] = [];
  let manifest: ApiPluginManifest | null = null;
  let generatedPath: string | null = null;

  const baseSource = await resolveContractSource({
    configDir: opts.configDir,
    runtimeDir,
    key: "api",
    source: opts.runtimeConfig.api,
    baseUrl: opts.apiBaseUrl,
    generatedSubdir: "api",
  });
  sources.push(baseSource);

  for (const [key, plugin] of pluginEntries) {
    const source = await resolveContractSource({
      configDir: opts.configDir,
      runtimeDir,
      key,
      source: plugin,
      baseUrl: plugin.url,
      generatedSubdir: `plugins/${key}`,
    });
    sources.push(source);
    if (source.generatedPath) {
      generatedPath = source.generatedPath;
    }
  }

  writeAggregateContractFile({
    configDir: opts.configDir,
    sources,
    pluginKeys: pluginEntries.map(([key]) => key),
  });

  if (opts.runtimeConfig.api.source !== "local") {
    manifest = await fetchApiPluginManifest(opts.apiBaseUrl);
  }

  return {
    bridgePath: join(opts.configDir, "ui", "src", "api-contract.gen.ts"),
    generatedPath,
    manifest,
    source: opts.runtimeConfig.api.source,
  };
}
