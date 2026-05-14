import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { RuntimeConfig } from "../types";

const POSTGRES_USER = "everythingdev";
const POSTGRES_PASSWORD = "everythingdev";
const API_DATABASE_SECRET = "API_DATABASE_URL";
const AUTH_DATABASE_SECRET = "AUTH_DATABASE_URL";
const BASE_DATABASE_PORT = 5434;

interface DatabaseSecretConfig {
  secret: string;
  slug: string;
  port: number;
  serviceName: string;
  databaseName: string;
  volumeName: string;
  url: string;
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

function getRuntimeSecrets(runtimeConfig: RuntimeConfig): string[] {
  const pluginSecrets = Object.values(runtimeConfig.plugins ?? {}).flatMap(
    (plugin) => plugin.secrets ?? [],
  );

  return uniqueSecrets([
    API_DATABASE_SECRET,
    AUTH_DATABASE_SECRET,
    ...(runtimeConfig.api.secrets ?? []),
    ...(runtimeConfig.auth?.secrets ?? []),
    ...pluginSecrets,
  ]);
}

function normalizeDatabaseSlug(secret: string): string {
  return secret.replace(/_DATABASE_URL$/, "").toLowerCase();
}

function buildDatabaseConfigs(secrets: string[]): DatabaseSecretConfig[] {
  const databaseSecrets = uniqueSecrets(
    secrets.filter((secret) => secret.endsWith("_DATABASE_URL")),
  );

  const additionalSecrets = databaseSecrets
    .filter((secret) => secret !== API_DATABASE_SECRET && secret !== AUTH_DATABASE_SECRET)
    .sort((a, b) => a.localeCompare(b));

  const orderedSecrets = [API_DATABASE_SECRET, AUTH_DATABASE_SECRET, ...additionalSecrets];

  return orderedSecrets.map((secret, index) => {
    const slug = normalizeDatabaseSlug(secret);
    const port =
      secret === API_DATABASE_SECRET
        ? 5432
        : secret === AUTH_DATABASE_SECRET
          ? 5433
          : BASE_DATABASE_PORT + index - 2;

    return {
      secret,
      slug,
      port,
      serviceName: `postgres-${slug.replace(/_/g, "-")}`,
      databaseName: `${slug}_db`,
      volumeName: `postgres_${slug}_data`,
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
  secrets: string[],
  databases: DatabaseSecretConfig[],
  options: { forExample: boolean },
): string {
  const databaseMap = new Map(databases.map((entry) => [entry.secret, entry]));
  const lines = [
    "# Generated from configured bos secrets",
    "# Update values as needed for your local environment",
    "",
  ];

  for (const secret of secrets) {
    lines.push(`${secret}=${defaultSecretValue(secret, databaseMap, options)}`);
  }

  return `${lines.join("\n")}\n`;
}

function renderDockerCompose(databases: DatabaseSecretConfig[]): string {
  const lines = [
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
  }

  return `${lines.join("\n")}\n`;
}

export function writeGeneratedInfra(configDir: string, runtimeConfig: RuntimeConfig): string[] {
  const secrets = getRuntimeSecrets(runtimeConfig);
  const databases = buildDatabaseConfigs(secrets);
  const envExamplePath = join(configDir, ".env.example");
  const dockerComposePath = join(configDir, "docker-compose.yml");

  writeFileSync(envExamplePath, renderEnvFile(secrets, databases, { forExample: true }));
  writeFileSync(dockerComposePath, renderDockerCompose(databases));

  return secrets;
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
