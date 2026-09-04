import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import { config as loadDotenv } from "dotenv";
import type { RuntimeConfig } from "../types";

const POSTGRES_USER = "everythingdev";
const POSTGRES_PASSWORD = "everythingdev";
const API_DATABASE_SECRET = "API_DATABASE_URL";
const AUTH_DATABASE_SECRET = "AUTH_DATABASE_URL";
const HOST_SECRET = "CORS_ORIGIN";
const BASE_REDIS_PORT = 6379;
const TEST_AUTH_SECRET = "regression-test-secret-do-not-use-in-production";
const TEST_DATABASE_PORT_BASE = 5434;
const VESTIGIAL_SECRETS = new Set([
  "NEAR_RELAYER_PRIVATE_KEY_MAINNET",
  "NEAR_RELAYER_PRIVATE_KEY_TESTNET",
]);

export interface DatabaseSecretConfig {
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

export interface RedisSecretConfig {
  secret: string;
  slug: string;
  fromKey: string;
  port: number;
  serviceName: string;
  containerName: string;
  volumeName: string;
  url: string;
}

export interface TestDatabaseServiceConfig {
  serviceName: string;
  containerName: string;
  port: number;
  databaseName: string;
  volumeName: string;
}

export interface TestInfraConfig {
  services: TestDatabaseServiceConfig[];
  urlBySecret: Map<string, string>;
}

export interface SecretGroup {
  section: string;
  secrets: string[];
}

interface DevPortState {
  host?: number;
  api?: number;
  ui?: number;
  auth?: number;
  pluginPortStart?: number;
}

export type { DevPortState };

export interface PortState {
  postgresPorts: Record<string, number>;
  redisPorts: Record<string, number>;
  devPorts?: DevPortState;
}

export interface GeneratedInfraSpec {
  groups: SecretGroup[];
  databases: DatabaseSecretConfig[];
  redis: RedisSecretConfig[];
  testDatabases: TestInfraConfig;
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

export function loadPortState(configDir?: string): PortState {
  if (!configDir) return { postgresPorts: {}, redisPorts: {} };
  const statePath = join(configDir, ".bos", "infra-state.json");
  if (!existsSync(statePath)) return { postgresPorts: {}, redisPorts: {} };
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf-8")) as Partial<PortState>;
    return {
      postgresPorts: raw.postgresPorts ?? {},
      redisPorts: raw.redisPorts ?? {},
      devPorts: raw.devPorts,
    };
  } catch {
    return { postgresPorts: {}, redisPorts: {} };
  }
}

export function savePortState(configDir: string, state: PortState): void {
  const statePath = join(configDir, ".bos", "infra-state.json");
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function resolvePort(slug: string, portMap: Record<string, number>, basePort: number): number {
  if (portMap[slug] !== undefined) return portMap[slug];
  const assigned = Object.values(portMap);
  const maxAssigned = assigned.length > 0 ? Math.max(...assigned) : basePort - 1;
  const next = Math.max(maxAssigned + 1, basePort);
  portMap[slug] = next;
  return next;
}

export function normalizeRedisSlug(secret: string): string {
  return secret.replace(/_REDIS_URL$/, "").toLowerCase();
}

function extendsRefAccount(extendsRef: string | undefined): string | null {
  if (!extendsRef || typeof extendsRef !== "string") return null;
  const match = extendsRef.match(/^bos:\/\/([^/]+)\//);
  return match?.[1] ?? null;
}

export function getSecretGroups(runtimeConfig: RuntimeConfig): SecretGroup[] {
  const groups: SecretGroup[] = [];
  const seen = new Set<string>();

  const addGroup = (section: string, secrets: string[]) => {
    const filtered = secrets.filter((s) => {
      if (VESTIGIAL_SECRETS.has(s)) return false;
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
): { spec: GeneratedInfraSpec; portState: PortState } {
  const groups = getSecretGroups(runtimeConfig);
  const allSecrets = groups.flatMap((group) => group.secrets);
  const originMap = configDir ? buildOriginMap(configDir, runtimeConfig) : new Map();
  const portState = loadPortState(configDir);

  const databases = buildDatabaseConfigs(allSecrets, originMap, portState.postgresPorts);
  const redis = buildRedisConfigs(allSecrets, originMap, portState.redisPorts);
  const testDatabases = buildTestInfra(databases);

  return { spec: { groups, databases, redis, testDatabases }, portState };
}

export { buildGeneratedInfraSpec };

export function normalizeDatabaseSlug(secret: string): string {
  return secret.replace(/_DATABASE_URL$/, "").toLowerCase();
}

export function buildOriginMap(
  _configDir: string,
  runtimeConfig: RuntimeConfig,
): Map<string, string> {
  const originMap = new Map<string, string>();
  const account = runtimeConfig.account;

  for (const secret of runtimeConfig.api.secrets ?? []) {
    if (!originMap.has(secret)) originMap.set(secret, account);
  }

  const authOrigin = extendsRefAccount(runtimeConfig.auth?.extendsRef) ?? account;
  for (const secret of runtimeConfig.auth?.secrets ?? []) {
    if (!originMap.has(secret)) originMap.set(secret, authOrigin);
  }

  for (const [_pluginKey, pluginEntry] of Object.entries(runtimeConfig.plugins ?? {})) {
    const pluginOrigin = extendsRefAccount(pluginEntry.extendsRef) ?? account;
    for (const secret of pluginEntry.secrets ?? []) {
      if (!originMap.has(secret)) originMap.set(secret, pluginOrigin);
    }
  }

  for (const secret of runtimeConfig.host.secrets ?? []) {
    if (!originMap.has(secret)) originMap.set(secret, account);
  }

  return originMap;
}

export function buildDatabaseConfigs(
  secrets: string[],
  originMap: Map<string, string>,
  portMap: Record<string, number>,
): DatabaseSecretConfig[] {
  const databaseSecrets = uniqueSecrets(
    secrets.filter((secret) => secret.endsWith("_DATABASE_URL")),
  );

  const orderedSecrets = [...databaseSecrets];

  // Prune stale entries from removed plugins
  const currentSlugs = new Set(orderedSecrets.map(normalizeDatabaseSlug));
  for (const slug of Object.keys(portMap)) {
    if (!currentSlugs.has(slug)) delete portMap[slug];
  }

  // Sort by slug for deterministic assignment order
  orderedSecrets.sort((a, b) => normalizeDatabaseSlug(a).localeCompare(normalizeDatabaseSlug(b)));

  const apiFromKey = originMap.get(API_DATABASE_SECRET) ?? "";
  const apiVolumeName = apiFromKey
    ? `${apiFromKey.replace(/\./g, "_")}_postgres_api_data`
    : `postgres_api_data`;
  const apiContainerName = apiFromKey ? `${apiFromKey}-postgres-api` : `postgres-api`;

  for (const secret of orderedSecrets) {
    const slug = normalizeDatabaseSlug(secret);
    if (secret === AUTH_DATABASE_SECRET) {
      portMap[slug] = 5433;
    } else {
      portMap[slug] = 5432;
    }
  }

  return orderedSecrets.map((secret) => {
    const slug = normalizeDatabaseSlug(secret);
    const fromKey = originMap.get(secret) ?? "";
    const isAuth = secret === AUTH_DATABASE_SECRET;
    const port = portMap[slug];

    if (isAuth) {
      const volumeName = fromKey
        ? `${fromKey.replace(/\./g, "_")}_postgres_${slug}_data`
        : `postgres_${slug}_data`;
      const containerName = fromKey ? `${fromKey}-postgres-${slug}` : `postgres-${slug}`;
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
    }

    return {
      secret,
      slug,
      fromKey,
      port: 5432,
      serviceName: "postgres-api",
      containerName: apiContainerName,
      databaseName: "api_db",
      volumeName: apiVolumeName,
      url: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/api_db`,
    };
  });
}

export function buildTestInfra(databases: DatabaseSecretConfig[]): TestInfraConfig {
  const services: TestDatabaseServiceConfig[] = [];
  const urlBySecret = new Map<string, string>();
  const serviceBySource = new Map<string, TestDatabaseServiceConfig>();

  const uniqueDbs = uniqueDatabaseServices(databases);
  if (uniqueDbs.length === 0) return { services, urlBySecret };

  const maxDevPort = Math.max(...uniqueDbs.map((db) => db.port));
  let nextPort = Math.max(maxDevPort + 1, TEST_DATABASE_PORT_BASE);

  for (const db of uniqueDbs) {
    const service: TestDatabaseServiceConfig = {
      serviceName: `${db.serviceName}-test`,
      containerName: `${db.containerName}-test`,
      port: nextPort++,
      databaseName: db.databaseName.endsWith("_db")
        ? `${db.databaseName.slice(0, -"_db".length)}_test_db`
        : `${db.databaseName}_test`,
      volumeName: db.volumeName.endsWith("_data")
        ? `${db.volumeName.slice(0, -"_data".length)}_test_data`
        : `${db.volumeName}_test`,
    };
    services.push(service);
    serviceBySource.set(db.serviceName, service);
  }

  for (const db of databases) {
    const service = serviceBySource.get(db.serviceName);
    if (!service) continue;
    urlBySecret.set(
      db.secret,
      `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${service.port}/${service.databaseName}`,
    );
  }

  return { services, urlBySecret };
}

export function buildRedisConfigs(
  secrets: string[],
  originMap: Map<string, string>,
  portMap: Record<string, number>,
): RedisSecretConfig[] {
  const redisSecrets = uniqueSecrets(secrets.filter((secret) => secret.endsWith("_REDIS_URL")));
  const orderedSecrets = [...redisSecrets];

  // Prune stale entries from removed plugins
  const currentSlugs = new Set(orderedSecrets.map(normalizeRedisSlug));
  for (const slug of Object.keys(portMap)) {
    if (!currentSlugs.has(slug)) delete portMap[slug];
  }

  // Sort by slug for deterministic assignment order
  orderedSecrets.sort((a, b) => normalizeRedisSlug(a).localeCompare(normalizeRedisSlug(b)));

  for (const secret of orderedSecrets) {
    const slug = normalizeRedisSlug(secret);
    resolvePort(slug, portMap, BASE_REDIS_PORT);
  }

  return orderedSecrets.map((secret) => {
    const slug = normalizeRedisSlug(secret);
    const fromKey = originMap.get(secret) ?? "";
    const port = portMap[slug];

    const volumeName = fromKey
      ? `${fromKey.replace(/\./g, "_")}_redis_${slug}_data`
      : `redis_${slug}_data`;

    const containerName = fromKey ? `${fromKey}-redis-${slug}` : `redis-${slug}`;

    return {
      secret,
      slug,
      fromKey,
      port,
      serviceName: `redis-${slug.replace(/_/g, "-")}`,
      containerName,
      volumeName,
      url: `redis://localhost:${port}`,
    };
  });
}

function extractPortFromUrl(url: string): string | null {
  const match = url.match(/:(\d{4,5})(?:\/|$)/);
  return match?.[1] ?? null;
}

function resolveDevHostPort(runtimeConfig: RuntimeConfig): number {
  if (typeof runtimeConfig.host?.port === "number") return runtimeConfig.host.port;
  const fromUrl = runtimeConfig.host?.url ? extractPortFromUrl(runtimeConfig.host.url) : null;
  if (fromUrl) {
    const parsed = Number.parseInt(fromUrl, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 3000;
}

export { resolveDevHostPort };

function defaultSecretValue(
  secret: string,
  databases: Map<string, DatabaseSecretConfig>,
  redisConfigs: Map<string, RedisSecretConfig>,
  options: { forExample: boolean; devHostPort?: number },
): string {
  if (secret === "BETTER_AUTH_SECRET") {
    return options.forExample ? "" : randomBytes(32).toString("base64url");
  }

  if (secret === "CORS_ORIGIN") {
    if (options.forExample) {
      return "http://localhost:3000";
    }
    if (typeof options.devHostPort === "number") {
      return `http://localhost:${options.devHostPort}`;
    }
    return "http://localhost:3000";
  }

  return databases.get(secret)?.url ?? redisConfigs.get(secret)?.url ?? "";
}

function renderEnvFile(
  groups: SecretGroup[],
  databases: DatabaseSecretConfig[],
  redisConfigs: RedisSecretConfig[],
  options: { forExample: boolean; devHostPort?: number },
): string {
  const databaseMap = new Map(databases.map((entry) => [entry.secret, entry]));
  const redisMap = new Map(redisConfigs.map((entry) => [entry.secret, entry]));
  const lines: string[] = [
    "# Generated from configured bos secrets",
    "# Update values as needed for your local environment",
    "",
  ];

  for (const group of groups) {
    lines.push(`# ${group.section}`);
    for (const secret of group.secrets) {
      lines.push(`${secret}=${defaultSecretValue(secret, databaseMap, redisMap, options)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export { renderEnvFile };

function renderEnvTestFile(groups: SecretGroup[], testDatabases: TestInfraConfig): string {
  const lines: string[] = [
    "# Generated test environment — loaded by test suites instead of .env",
    "# Test databases run on dedicated *-test docker-compose services",
    "",
  ];

  for (const group of groups) {
    const entries: string[] = [];
    for (const secret of group.secrets) {
      if (secret === "BETTER_AUTH_SECRET") {
        entries.push(`${secret}=${TEST_AUTH_SECRET}`);
      } else if (testDatabases.urlBySecret.has(secret)) {
        entries.push(`${secret}=${testDatabases.urlBySecret.get(secret)}`);
      }
    }
    if (entries.length > 0) {
      lines.push(`# ${group.section}`);
      lines.push(...entries);
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

export { renderEnvTestFile };

function uniqueDatabaseServices<T extends { serviceName: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.serviceName)) return false;
    seen.add(item.serviceName);
    return true;
  });
}

export interface ComposeDatabaseService {
  serviceName: string;
  containerName: string;
  port: number;
  volumeName: string;
  databaseName: string;
}

function renderDockerCompose(
  databases: ComposeDatabaseService[],
  redisConfigs: { serviceName: string; containerName: string; port: number; volumeName: string }[],
  projectName: string,
  testDatabases: TestDatabaseServiceConfig[] = [],
): string {
  const lines = [`name: ${projectName}`, ""];
  const uniqueDbs = uniqueDatabaseServices(databases);
  const hasPostgres = uniqueDbs.length > 0 || testDatabases.length > 0;

  if (hasPostgres) {
    lines.push(
      "x-pg-common: &pg-common",
      "  image: postgres:17-alpine",
      "  environment: &pg-env",
      `    POSTGRES_USER: ${POSTGRES_USER}`,
      `    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}`,
      "",
    );
  }

  if (redisConfigs.length > 0) {
    lines.push(
      "x-redis-common: &redis-common",
      "  image: redis:7-alpine",
      "  command: redis-server --appendonly yes",
      "  healthcheck:",
      '    test: ["CMD", "redis-cli", "ping"]',
      "    interval: 3s",
      "    timeout: 3s",
      "    retries: 5",
      "",
    );
  }

  lines.push("services:");

  for (const database of uniqueDbs) {
    lines.push(`  ${database.serviceName}:`);
    lines.push("    <<: *pg-common");
    lines.push(`    container_name: ${database.containerName}`);
    lines.push("    environment:");
    lines.push("      <<: *pg-env");
    lines.push(`      POSTGRES_DB: ${database.databaseName}`);
    lines.push("    ports:");
    lines.push(`      - "${database.port}:5432"`);
    lines.push("    healthcheck:");
    lines.push(
      `      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${database.databaseName}"]`,
    );
    lines.push("      interval: 3s");
    lines.push("      timeout: 3s");
    lines.push("      retries: 5");
    lines.push("    volumes:");
    lines.push(`      - ${database.volumeName}:/var/lib/postgresql/data`);
    lines.push("");
  }

  for (const database of testDatabases) {
    lines.push(`  ${database.serviceName}:`);
    lines.push("    <<: *pg-common");
    lines.push(`    container_name: ${database.containerName}`);
    lines.push("    environment:");
    lines.push("      <<: *pg-env");
    lines.push(`      POSTGRES_DB: ${database.databaseName}`);
    lines.push("    ports:");
    lines.push(`      - "${database.port}:5432"`);
    lines.push("    healthcheck:");
    lines.push(
      `      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${database.databaseName}"]`,
    );
    lines.push("      interval: 3s");
    lines.push("      timeout: 3s");
    lines.push("      retries: 5");
    lines.push("    volumes:");
    lines.push(`      - ${database.volumeName}:/var/lib/postgresql/data`);
    lines.push("");
  }

  for (const redis of redisConfigs) {
    lines.push(`  ${redis.serviceName}:`);
    lines.push("    <<: *redis-common");
    lines.push(`    container_name: ${redis.containerName}`);
    lines.push("    ports:");
    lines.push(`      - "${redis.port}:6379"`);
    lines.push("    volumes:");
    lines.push(`      - ${redis.volumeName}:/data`);
    lines.push("");
  }

  lines.push("volumes:");
  for (const database of uniqueDbs) {
    lines.push(`  ${database.volumeName}:`);
    lines.push(`    name: ${database.volumeName}`);
  }
  for (const database of testDatabases) {
    lines.push(`  ${database.volumeName}:`);
    lines.push(`    name: ${database.volumeName}`);
  }
  for (const redis of redisConfigs) {
    lines.push(`  ${redis.volumeName}:`);
    lines.push(`    name: ${redis.volumeName}`);
  }

  return `${lines.join("\n")}\n`;
}

export { renderDockerCompose };

export function renderEnvFileFromPlan(env: Record<string, string>, devHostPort?: number): string {
  const lines: string[] = [
    "# Generated from bos dev infra plan",
    "# Update values as needed for your local environment",
    "",
  ];
  const sortedKeys = Object.keys(env).sort();
  for (const key of sortedKeys) {
    let value = env[key];
    if (key === "CORS_ORIGIN" && devHostPort && !value) {
      value = `http://localhost:${devHostPort}`;
    }
    lines.push(`${key}=${value}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderDockerComposeFromPlan(
  databases: ComposeDatabaseService[],
  redis: { serviceName: string; containerName: string; port: number; volumeName: string }[],
  projectName: string,
): string {
  return renderDockerCompose(databases, redis, projectName);
}

export function materializeInfraPlan(
  configDir: string,
  planEnv: Record<string, string>,
  planDatabases: {
    serviceName: string;
    containerName: string;
    port: number;
    volumeName: string;
    databaseName: string;
  }[],
  planRedis: { serviceName: string; containerName: string; port: number; volumeName: string }[],
  projectName: string,
  devHostPort?: number,
): { envExampleChanged: boolean; dockerComposeChanged: boolean } {
  const envContent = renderEnvFileFromPlan(planEnv, devHostPort);
  const dockerContent = renderDockerComposeFromPlan(planDatabases, planRedis, projectName);

  const envExamplePath = join(configDir, ".env.example");
  const dockerComposePath = join(configDir, "docker-compose.yml");

  return {
    envExampleChanged: syncTextFile(envExamplePath, envContent),
    dockerComposeChanged: syncTextFile(dockerComposePath, dockerContent),
  };
}

function syncTextFile(filePath: string, nextContent: string): boolean {
  if (existsSync(filePath) && readFileSync(filePath, "utf-8") === nextContent) {
    return false;
  }

  writeFileSync(filePath, nextContent);
  return true;
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

let envLoadedDir: string | null = null;

export function loadProjectEnv(configDir: string): void {
  if (envLoadedDir === configDir) return;
  const envPath = join(configDir, ".env");
  if (!existsSync(envPath)) return;

  loadDotenv({ path: envPath, processEnv: process.env, quiet: true });
  envLoadedDir = configDir;
}

export interface CiServiceSpec {
  key: string;
  slug: string;
  image: string;
  env: Record<string, string>;
  ports: string[];
  healthcheck?: { test: string[]; interval: string; timeout: string; retries: number };
  volumes: string[];
  database?: { user: string; password: string; name: string };
}

export interface CiInfraPlan {
  account: string;
  gateway: string;
  project: string;
  env: Record<string, string>;
  services: CiServiceSpec[];
  generatedAt: string;
}

export function buildCiInfraPlan(
  runtimeConfig: RuntimeConfig,
  options: { configDir?: string; hostPortOverride?: number } = {},
): CiInfraPlan {
  const configDir = options.configDir;
  const originMap = configDir
    ? buildOriginMap(configDir, runtimeConfig)
    : new Map<string, string>();
  const portState = loadPortState(configDir);
  const allDatabaseSecrets = uniqueSecrets(
    collectAllSecrets(runtimeConfig).filter((s) => s.endsWith("_DATABASE_URL")),
  );
  const allDatabaseConfigs = buildDatabaseConfigs(
    allDatabaseSecrets,
    originMap,
    portState.postgresPorts,
  );
  const allRedisSecrets = uniqueSecrets(
    collectAllSecrets(runtimeConfig).filter((s) => s.endsWith("_REDIS_URL")),
  );
  const allRedisConfigs = buildRedisConfigs(allRedisSecrets, originMap, portState.redisPorts);
  if (configDir) savePortState(configDir, portState);

  const hostPort =
    options.hostPortOverride ??
    (Number.isFinite(Number(process.env.BOS_CI_HOST_PORT))
      ? Number(process.env.BOS_CI_HOST_PORT)
      : undefined) ??
    resolveDevHostPort(runtimeConfig);
  const env: Record<string, string> = {};
  const envBySecret = new Map<string, string>();
  for (const db of allDatabaseConfigs) envBySecret.set(db.secret, db.url);
  for (const r of allRedisConfigs) envBySecret.set(r.secret, r.url);

  const groups = getSecretGroups(runtimeConfig);
  for (const group of groups) {
    for (const secret of group.secrets) {
      const value = envBySecret.get(secret);
      if (value) env[secret] = value;
    }
  }

  env.CORS_ORIGIN = `http://127.0.0.1:${hostPort}`;
  if (!env.BETTER_AUTH_SECRET) env.BETTER_AUTH_SECRET = "";

  const services: CiServiceSpec[] = [];
  const seenPorts = new Set<string>();

  for (const db of allDatabaseConfigs) {
    const portKey = `${db.port}:5432`;
    if (seenPorts.has(portKey)) continue;
    seenPorts.add(portKey);
    services.push({
      key: db.slug,
      slug: db.slug,
      image: "postgres:17-alpine",
      env: {
        POSTGRES_USER: POSTGRES_USER,
        POSTGRES_PASSWORD: POSTGRES_PASSWORD,
        POSTGRES_DB: db.databaseName,
      },
      ports: [`${db.port}:5432`],
      healthcheck: {
        test: ["CMD-SHELL", `pg_isready -U ${POSTGRES_USER} -d ${db.databaseName}`],
        interval: "3s",
        timeout: "3s",
        retries: 10,
      },
      volumes: [`${db.volumeName}:/var/lib/postgresql/data`],
      database: { user: POSTGRES_USER, password: POSTGRES_PASSWORD, name: db.databaseName },
    });
  }

  for (const r of allRedisConfigs) {
    services.push({
      key: r.slug,
      slug: r.slug,
      image: "redis:7-alpine",
      env: {},
      ports: [`${r.port}:6379`],
      healthcheck: {
        test: ["CMD", "redis-cli", "ping"],
        interval: "3s",
        timeout: "3s",
        retries: 10,
      },
      volumes: [
        `${(r.fromKey || runtimeConfig.account).replace(/\./g, "_")}_redis_${r.slug}_data:/data`,
      ],
    });
  }

  return {
    account: runtimeConfig.account,
    gateway: runtimeConfig.domain ?? runtimeConfig.account,
    project: runtimeConfig.account,
    env,
    services,
    generatedAt: new Date().toISOString(),
  };
}

function collectAllSecrets(runtimeConfig: RuntimeConfig): string[] {
  const all: string[] = [];
  all.push(...(runtimeConfig.host.secrets ?? []));
  all.push(...(runtimeConfig.api.secrets ?? []));
  if (runtimeConfig.auth) all.push(...(runtimeConfig.auth.secrets ?? []));
  if (runtimeConfig.plugins) {
    for (const plugin of Object.values(runtimeConfig.plugins)) {
      if (plugin.secrets) all.push(...plugin.secrets);
    }
  }
  return all.filter((s) => !VESTIGIAL_SECRETS.has(s));
}

function _uniqueSlugs<T extends { slug: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    out.push(entry);
  }
  return out;
}
