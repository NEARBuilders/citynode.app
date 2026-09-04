import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4100";
const DEFAULT_PG_USER = "everythingdev";
const DEFAULT_PG_PASSWORD = "everythingdev";
const DEFAULT_BETTER_AUTH_SECRET = "regression-test-secret-do-not-use-in-production";

export function findRepoRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(current, "bos.config.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function readDotEnv(repoRoot) {
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in parsed)) parsed[key] = value;
  }
  return parsed;
}

function databaseSecrets(config) {
  const sections = [
    config.app?.api?.secrets,
    config.app?.auth?.secrets,
    ...Object.values(config.plugins ?? {}).map((plugin) => plugin?.secrets),
  ];
  const seen = new Set();
  const secrets = [];
  for (const list of sections) {
    for (const secret of list ?? []) {
      if (typeof secret === "string" && secret.endsWith("_DATABASE_URL") && !seen.has(secret)) {
        seen.add(secret);
        secrets.push(secret);
      }
    }
  }
  return secrets;
}

export function computeRegressionEnv({ repoRoot, env = process.env } = {}) {
  const root = repoRoot ?? findRepoRoot();
  if (!root) throw new Error("bos.config.json not found in any parent directory");
  const config = JSON.parse(fs.readFileSync(path.join(root, "bos.config.json"), "utf-8"));
  const fileEnv = readDotEnv(root);

  const pgUser = env.REGRESSION_PG_USER ?? fileEnv.REGRESSION_PG_USER ?? DEFAULT_PG_USER;
  const pgPassword =
    env.REGRESSION_PG_PASSWORD ?? fileEnv.REGRESSION_PG_PASSWORD ?? DEFAULT_PG_PASSWORD;
  const pgHost = env.REGRESSION_PG_HOST ?? fileEnv.REGRESSION_PG_HOST ?? "127.0.0.1";

  const dbUrls = {};
  for (const secret of databaseSecrets(config)) {
    if (env[secret]) {
      dbUrls[secret] = env[secret];
      continue;
    }
    if (fileEnv[secret]) {
      dbUrls[secret] = fileEnv[secret];
      continue;
    }
    const isAuth = secret === "AUTH_DATABASE_URL";
    const port = isAuth ? 5433 : 5432;
    const databaseName = isAuth ? "auth_db" : "api_db";
    dbUrls[secret] = `postgres://${pgUser}:${pgPassword}@${pgHost}:${port}/${databaseName}`;
  }

  const baseUrl = env.REGRESSION_BASE_URL ?? fileEnv.REGRESSION_BASE_URL ?? DEFAULT_BASE_URL;
  const authSecret =
    env.BETTER_AUTH_SECRET ?? fileEnv.BETTER_AUTH_SECRET ?? DEFAULT_BETTER_AUTH_SECRET;

  const basePort = Number(new URL(baseUrl).port) || 80;
  const localPluginCount = Object.values(config.plugins ?? {}).filter(
    (plugin) => typeof plugin?.development === "string" && plugin.development.startsWith("local:"),
  ).length;
  const stalePorts = [0, 1, 2, 3, 4].map((offset) => basePort + offset);
  for (let i = 0; i < localPluginCount * 2; i++) {
    stalePorts.push(basePort + 10 + i);
  }

  return { repoRoot: root, baseUrl, dbUrls, authSecret, stalePorts };
}

const thisFile = fileURLToPath(import.meta.url);
const isDirectRun = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === thisFile;

if (isDirectRun || process.argv.includes("--json")) {
  try {
    const result = computeRegressionEnv();
    if (process.argv.includes("--json")) {
      console.log(
        JSON.stringify(
          {
            baseUrl: result.baseUrl,
            dbUrls: result.dbUrls,
            authSecret: result.authSecret,
            stalePorts: result.stalePorts,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`repoRoot: ${result.repoRoot}`);
      console.log(`baseUrl:  ${result.baseUrl}`);
      for (const [key, value] of Object.entries(result.dbUrls)) {
        console.log(`${key}=${value}`);
      }
    }
  } catch (error) {
    console.error(`[regression-env] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
