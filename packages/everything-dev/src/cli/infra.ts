import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { config as loadDotenv } from "dotenv";
import type { RuntimeConfig } from "../types";

const POSTGRES_USER = "everythingdev";
const POSTGRES_PASSWORD = "everythingdev";
const API_DATABASE_SECRET = "API_DATABASE_URL";
const AUTH_DATABASE_SECRET = "AUTH_DATABASE_URL";
const HOST_SECRET = "CORS_ORIGIN";
const BASE_DATABASE_PORT = 5434;

interface DatabaseSecretConfig {
  secret: string;
  slug: string;
  fromKey: string;
  port: number;
  serviceName: string;
  containerName: string;
  databaseName: string;
  volumeName: string;
  url: string;
}

interface SecretGroup {
  section: string;
  secrets: string[];
}

interface GeneratedInfraSpec {
  groups: SecretGroup[];
  databases: DatabaseSecretConfig[];
}

interface SyncGeneratedInfraResult {
  secrets: string[];
  envExampleChanged: boolean;
  dockerComposeChanged: boolean;
}

function uniqueSecrets(values: Array<string | undefined>): string[] {
  const secrets: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    secrets.push(value);
  }

  return secrets;
}

function getSecretGroups(runtimeConfig: RuntimeConfig): SecretGroup[] {
  const groups: SecretGroup[] = [];
  const seen = new Set<string>();

  const addGroup = (section: string, secrets: string[]) => {
    const filtered = secrets.filter((s) => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
    if (filtered.length > 0) {
      groups.push({ section, secrets: filtered });
    }
  };

  addGroup("app.host", uniqueSecrets([...(runtimeConfig.host.secrets ?? []), HOST_SECRET]));

  addGroup("app.api", uniqueSecrets(runtimeConfig.api.secrets ?? []));

  if (runtimeConfig.auth) {
    addGroup("app.auth", uniqueSecrets(runtimeConfig.auth.secrets ?? []));
  }

  if (runtimeConfig.plugins) {
    for (const [pluginKey, plugin] of Object.entries(runtimeConfig.plugins)) {
      if (plugin.secrets && plugin.secrets.length > 0) {
        addGroup(`plugins.${pluginKey}`, plugin.secrets);
      }
    }
  }

  return groups;
}

function buildGeneratedInfraSpec(
  runtimeConfig: RuntimeConfig,
  configDir?: string,
): GeneratedInfraSpec {
  const groups = getSecretGroups(runtimeConfig);
  const originMap = configDir ? buildOriginMap(configDir, runtimeConfig) : new Map();
  const databases = buildDatabaseConfigs(groups.flatMap((group) => group.secrets), originMap);
  return { groups, databases };
}

function normalizeDatabaseSlug(secret: string): string {
  return secret.replace(/_DATABASE_URL$/, "").toLowerCase();
}

function buildOriginMap(configDir: string, runtimeConfig: RuntimeConfig): Map<string, string> {
  const configPath = join(configDir, "bos.config.json");

  const originMap = new Map<string, string>();
  const account = runtimeConfig.account;

  const resolveOrigin = (extendsRef: unknown): string | null => {
    if (typeof extendsRef === "string") {
      const match = extendsRef.match(/^bos:\/\/([^/]+)\//);
      return match?.[1] ?? null;
    }
    return null;
  };

  const rawConfig = existsSync(configPath)
    ? (JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>)
    : null;
  const rawPlugins = rawConfig?.plugins as Record<string, unknown> | undefined;

  for (const secret of runtimeConfig.api.secrets ?? []) {
    if (!originMap.has(secret)) originMap.set(secret, account);
  }

  const rawApp = rawConfig?.app as Record<string, unknown> | undefined;
  const authExtends = (rawApp?.auth as Record<string, unknown> | undefined)?.extends;
  const authOrigin = resolveOrigin(authExtends) ?? account;
  for (const secret of runtimeConfig.auth?.secrets ?? []) {
    if (!originMap.has(secret)) originMap.set(secret, authOrigin);
  }

  for (const [pluginKey, pluginEntry] of Object.entries(runtimeConfig.plugins ?? {})) {
    const rawPlugin = rawPlugins?.[pluginKey];
    let pluginOrigin: string;
    if (typeof rawPlugin === "string") {
      pluginOrigin = resolveOrigin(rawPlugin) ?? account;
    } else if (rawPlugin && typeof rawPlugin === "object") {
      pluginOrigin = resolveOrigin((rawPlugin as Record<string, unknown>).extends) ?? account;
    } else {
      pluginOrigin = account;
    }
    for (const secret of pluginEntry.secrets ?? []) {
      if (!originMap.has(secret)) originMap.set(secret, pluginOrigin);
    }
  }

  for (const secret of runtimeConfig.host.secrets ?? []) {
    if (!originMap.has(secret)) originMap.set(secret, account);
  }

  return originMap;
}

function buildDatabaseConfigs(
  secrets: string[],
  originMap: Map<string, string>,
): DatabaseSecretConfig[] {
  const databaseSecrets = uniqueSecrets(
    secrets.filter((secret) => secret.endsWith("_DATABASE_URL")),
  );

  const additionalSecrets = databaseSecrets
    .filter((secret) => secret !== API_DATABASE_SECRET && secret !== AUTH_DATABASE_SECRET)
    .sort((a, b) => a.localeCompare(b));

  const orderedSecrets = [API_DATABASE_SECRET, AUTH_DATABASE_SECRET, ...additionalSecrets];

  return orderedSecrets.map((secret, index) => {
    const slug = normalizeDatabaseSlug(secret);
    const fromKey = originMap.get(secret) ?? "";
    const port =
      secret === API_DATABASE_SECRET
        ? 5432
        : secret === AUTH_DATABASE_SECRET
          ? 5433
          : BASE_DATABASE_PORT + index - 2;

    const volumeName = fromKey
      ? `${fromKey.replace(/\./g, "_")}_postgres_${slug}_data`
      : `postgres_${slug}_data`;

    const containerName = fromKey
      ? `${fromKey}-postgres-${slug}`
      : `postgres-${slug}`;

    return {
      secret,
      slug,
      fromKey,
      port,
      serviceName: `postgres-${slug.replace(/_/g, "-")}`,
      containerName,
      databaseName: `${slug}_db`,
      volumeName,
      url: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${port}/${slug}_db`,
    };
  });
}

function defaultSecretValue(
  secret: string,
  databases: Map<string, DatabaseSecretConfig>,
  options: { forExample: boolean },
): string {
  if (secret === "BETTER_AUTH_SECRET") {
    return options.forExample ? "" : randomBytes(32).toString("base64url");
  }

  if (secret === "CORS_ORIGIN") {
    return "http://localhost:3000";
  }

  return databases.get(secret)?.url ?? "";
}

function renderEnvFile(
  groups: SecretGroup[],
  databases: DatabaseSecretConfig[],
  options: { forExample: boolean },
): string {
  const databaseMap = new Map(databases.map((entry) => [entry.secret, entry]));
  const lines: string[] = [
    "# Generated from configured bos secrets",
    "# Update values as needed for your local environment",
    "",
  ];

  for (const group of groups) {
    lines.push(`# ${group.section}`);
    for (const secret of group.secrets) {
      lines.push(`${secret}=${defaultSecretValue(secret, databaseMap, options)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderDockerCompose(
  databases: DatabaseSecretConfig[],
  projectName: string,
): string {
  const lines = [
    `name: ${projectName}`,
    "",
    "x-pg-common: &pg-common",
    "  image: postgres:17-alpine",
    "  environment: &pg-env",
    `    POSTGRES_USER: ${POSTGRES_USER}`,
    `    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}`,
    "  healthcheck:",
    '    test: ["CMD-SHELL", "pg_isready -U everythingdev"]',
    "    interval: 3s",
    "    timeout: 3s",
    "    retries: 5",
    "",
    "services:",
  ];

  for (const database of databases) {
    lines.push(`  ${database.serviceName}:`);
    lines.push("    <<: *pg-common");
    lines.push(`    container_name: ${database.containerName}`);
    lines.push("    environment:");
    lines.push("      <<: *pg-env");
    lines.push(`      POSTGRES_DB: ${database.databaseName}`);
    lines.push("    ports:");
    lines.push(`      - "${database.port}:5432"`);
    lines.push("    volumes:");
    lines.push(`      - ${database.volumeName}:/var/lib/postgresql/data`);
    lines.push("");
  }

  lines.push("volumes:");
  for (const database of databases) {
    lines.push(`  ${database.volumeName}:`);
    lines.push(`    name: ${database.volumeName}`);
  }

  return `${lines.join("\n")}\n`;
}

function syncTextFile(filePath: string, nextContent: string): boolean {
  if (existsSync(filePath) && readFileSync(filePath, "utf-8") === nextContent) {
    return false;
  }

  writeFileSync(filePath, nextContent);
  return true;
}

export function writeGeneratedInfra(configDir: string, runtimeConfig: RuntimeConfig): string[] {
  return syncGeneratedInfra(configDir, runtimeConfig).secrets;
}

export function syncGeneratedInfra(
  configDir: string,
  runtimeConfig: RuntimeConfig,
): SyncGeneratedInfraResult {
  const spec = buildGeneratedInfraSpec(runtimeConfig, configDir);
  const secrets = spec.groups.flatMap((group) => group.secrets);
  const newEnvContent = renderEnvFile(spec.groups, spec.databases, { forExample: true });
  const newDockerContent = renderDockerCompose(spec.databases, runtimeConfig.account);

  const envExamplePath = join(configDir, ".env.example");
  const dockerComposePath = join(configDir, "docker-compose.yml");

  return {
    secrets,
    envExampleChanged: syncTextFile(envExamplePath, newEnvContent),
    dockerComposeChanged: syncTextFile(dockerComposePath, newDockerContent),
  };
}

export function ensureEnvFile(configDir: string): void {
  const envPath = join(configDir, ".env");
  const examplePath = join(configDir, ".env.example");

  if (existsSync(envPath) || !existsSync(examplePath)) return;

  const content = readFileSync(examplePath, "utf-8");
  const lines = content.split("\n");
  const secret = randomBytes(32).toString("base64url");
  const updated = lines
    .map((line) => {
      if (/^BETTER_AUTH_SECRET=/.test(line)) {
        return `BETTER_AUTH_SECRET=${secret}`;
      }
      return line;
    })
    .join("\n");

  writeFileSync(envPath, updated);
  p.log.info("Created .env from generated .env.example with generated BETTER_AUTH_SECRET");
}

export function loadProjectEnv(configDir: string): void {
  const envPath = join(configDir, ".env");
  if (!existsSync(envPath)) return;

  loadDotenv({ path: envPath, processEnv: process.env, quiet: true });
}
