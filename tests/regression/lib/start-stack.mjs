#!/usr/bin/env bun
// Boots the regression stack (dev/prod/backcompat) with the test environment
// from .env.test so regression runs never touch dev databases or dev ports.
import { spawn } from "node:child_process";
import net from "node:net";
import { computeRegressionEnv, findRepoRoot, readDotEnv } from "./regression-env.mjs";

const BASE_PORT = 4100;
const PROBE_RETRIES = 6;
const PROBE_DELAY_MS = 500;

const MODES = {
  dev: {
    command: [
      "packages/everything-dev/src/cli.ts",
      "dev",
      "--no-interactive",
      "--ssr",
      "--port",
      String(BASE_PORT),
      "--api-port",
      String(BASE_PORT + 1),
      "--auth-port",
      String(BASE_PORT + 2),
      "--ui-port",
      String(BASE_PORT + 3),
      "--plugin-port-start",
      String(BASE_PORT + 10),
    ],
  },
  prod: {
    command: ["./node_modules/everything-dev/dist/cli.mjs", "start", "--no-interactive"],
    env: { PORT: String(BASE_PORT) },
  },
  backcompat: {
    command: [
      "packages/everything-dev/src/cli.ts",
      "dev",
      "--no-interactive",
      "--ssr",
      "--host",
      "local",
      "--ui",
      "remote",
      "--api",
      "remote",
      "--auth",
      "local",
      "--remote-plugins",
      "apps,template",
      "--port",
      String(BASE_PORT),
      "--api-port",
      String(BASE_PORT + 1),
      "--auth-port",
      String(BASE_PORT + 2),
      "--ui-port",
      String(BASE_PORT + 3),
      "--plugin-port-start",
      String(BASE_PORT + 10),
    ],
  },
};

function log(msg) {
  console.log(`[start-stack] ${msg}`);
}

function probeTcp(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitForDatabases(dbUrls) {
  const targets = new Map();
  for (const [secret, url] of Object.entries(dbUrls)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") continue;
      targets.set(`${parsed.hostname}:${parsed.port || "5432"}`, secret);
    } catch {
      // ignore malformed URLs, the stack will surface them
    }
  }
  if (targets.size === 0) return;

  for (let attempt = 1; attempt <= PROBE_RETRIES; attempt++) {
    const results = await Promise.all(
      [...targets.keys()].map(async (target) => ({
        target,
        ok: await probeTcp(...target.split(":")),
      })),
    );
    if (results.every((r) => r.ok)) return;

    const missing = results.filter((r) => !r.ok).map((r) => r.target);
    if (attempt === PROBE_RETRIES) {
      throw new Error(
        `test databases not reachable: ${missing.join(", ")}. ` +
          "Start them with `bun run test:db:up` (docker compose postgres-*-test services).",
      );
    }
    log(`waiting for test databases (${missing.join(", ")})...`);
    await Bun.sleep(PROBE_DELAY_MS);
  }
}

const mode = process.argv[2] ?? "dev";
const spec = MODES[mode];
if (!spec) {
  console.error(`[start-stack] unknown mode: ${mode} (expected dev | prod | backcompat)`);
  process.exit(1);
}

const root = findRepoRoot();
if (!root) {
  console.error("[start-stack] bos.config.json not found in any parent directory");
  process.exit(1);
}

const regressionEnv = computeRegressionEnv({ repoRoot: root });
await waitForDatabases(regressionEnv.dbUrls);

const testEnv = readDotEnv(root, ".env.test");
const stackEnv = {
  ...process.env,
  ...spec.env,
  BOS_NO_PERSIST_PORTS: "1",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? `http://localhost:${BASE_PORT}`,
};
for (const [key, value] of Object.entries(testEnv)) {
  if (key.endsWith("_DATABASE_URL") || key === "BETTER_AUTH_SECRET") {
    stackEnv[key] = value;
  }
}

log(`starting ${mode} stack on port ${BASE_PORT} with test databases`);
const child = spawn(process.execPath, spec.command, {
  cwd: root,
  env: stackEnv,
  stdio: "inherit",
});

const forward = (signal) => {
  child.kill(signal);
};
process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));

const exitCode = await new Promise((resolve) => {
  child.once("exit", (code) => resolve(code ?? 0));
});
process.exit(exitCode);
