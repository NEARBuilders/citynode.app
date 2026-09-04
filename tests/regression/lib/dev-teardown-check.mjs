#!/usr/bin/env bun
import { spawn } from "node:child_process";
import net from "node:net";
import { computeRegressionEnv, readDotEnv } from "./regression-env.mjs";

const BASE = Number(process.env.TEARDOWN_BASE_PORT ?? 4200);
const HOST_PORT = BASE;
const PORT_RANGE = [0, 1, 2, 3, 4, 5].map((o) => BASE + o);
const PLUGIN_PORTS = [0, 1, 2, 3, 4, 5, 6, 7].map((o) => BASE + 10 + o);
const ALL_PORTS = [...PORT_RANGE, ...PLUGIN_PORTS];
const BOOT_TIMEOUT_MS = 150_000;
const TEARDOWN_WAIT_MS = 30_000;

const REPO_ROOT = computeRegressionEnv().repoRoot;

function log(step, msg) {
  console.log(`[teardown-check] ${step}: ${msg}`);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1", timeout: 400 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const fail = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", fail);
    socket.once("timeout", fail);
  });
}

async function anyPortOpen(ports) {
  const results = await Promise.all(ports.map(portOpen));
  return ports.filter((_, i) => results[i]);
}

function listeningPids(ports) {
  const pids = new Set();
  for (const port of ports) {
    try {
      const out = Bun.spawnSync([
        "sh",
        "-c",
        `lsof -nP -ti:${port} -sTCP:LISTEN 2>/dev/null || true`,
      ]);
      for (const line of String(out.stdout).split("\n")) {
        const pid = Number(line.trim());
        if (pid > 1) pids.add(pid);
      }
    } catch {
      // best-effort
    }
  }
  return pids;
}

function startStack() {
  const testEnv = readDotEnv(REPO_ROOT, ".env.test");
  const stackEnv = { ...process.env, BOS_NO_PERSIST_PORTS: "1", FORCE_COLOR: "0" };
  for (const [key, value] of Object.entries(testEnv)) {
    if (key.endsWith("_DATABASE_URL") || key === "BETTER_AUTH_SECRET") {
      stackEnv[key] = value;
    }
  }
  const child = spawn(
    process.execPath,
    [
      "packages/everything-dev/src/cli.ts",
      "dev",
      "--no-interactive",
      "--ssr",
      "--port",
      String(BASE),
      "--api-port",
      String(BASE + 1),
      "--auth-port",
      String(BASE + 2),
      "--ui-port",
      String(BASE + 3),
      "--plugin-port-start",
      String(BASE + 10),
    ],
    {
      cwd: REPO_ROOT,
      env: stackEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function waitForHealthy(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await Bun.sleep(500);
  }
  return false;
}

async function runCase(label, signal) {
  log(label, `booting stack on ${BASE}`);
  const stack = startStack();
  const healthy = await waitForHealthy(HOST_PORT, BOOT_TIMEOUT_MS);
  if (!healthy) {
    log(label, `FAIL: stack never became healthy on ${HOST_PORT}`);
    stack.kill("SIGKILL");
    return false;
  }
  const before = await anyPortOpen(ALL_PORTS);
  log(label, `healthy; ${before.length} ports listening before teardown`);

  log(label, `sending ${signal} to cli pid ${stack.pid}`);
  process.kill(stack.pid, signal);

  const deadline = Date.now() + TEARDOWN_WAIT_MS;
  let openPorts = before;
  while (Date.now() < deadline) {
    openPorts = await anyPortOpen(ALL_PORTS);
    if (openPorts.length === 0) break;
    await Bun.sleep(500);
  }

  if (openPorts.length > 0) {
    const pids = listeningPids(openPorts);
    log(label, `RED: leaked listeners on ${openPorts.join(", ")} (pids: ${[...pids].join(", ")})`);
    for (const pid of pids) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
    }
    return false;
  }
  log(label, "GREEN: no listeners remain after teardown");
  return true;
}

async function runPreflightCase() {
  const label = "preflight";
  log(label, `booting stack on ${BASE}`);
  const stack = startStack();
  const healthy = await waitForHealthy(HOST_PORT, BOOT_TIMEOUT_MS);
  if (!healthy) {
    log(label, `FAIL: stack never became healthy on ${HOST_PORT}`);
    stack.kill("SIGKILL");
    return false;
  }
  process.kill(stack.pid, "SIGKILL");
  await Bun.sleep(2000);
  const leaked = await anyPortOpen(ALL_PORTS);
  if (leaked.length === 0) {
    log(label, "no leak after SIGKILL (unexpected but acceptable)");
    return true;
  }
  log(label, `SIGKILL leaked listeners on ${leaked.join(", ")} — running stale-port cleanup`);

  const cleanup = Bun.spawnSync(
    [process.execPath, "tests/regression/lib/kill-stale-ports.mjs", "--base", String(BASE)],
    { cwd: REPO_ROOT },
  );
  process.stdout.write(cleanup.stdout);
  if (cleanup.exitCode !== 0) {
    log(label, `RED: kill-stale-ports.mjs failed (exit ${cleanup.exitCode})`);
    listeningPids(ALL_PORTS).forEach((pid) => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
    });
    return false;
  }
  const remaining = await anyPortOpen(ALL_PORTS);
  if (remaining.length > 0) {
    log(label, `RED: cleanup left listeners on ${remaining.join(", ")}`);
    listeningPids(ALL_PORTS).forEach((pid) => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
    });
    return false;
  }
  log(label, "GREEN: stale-port cleanup freed all leaked ports");
  return true;
}

const gracefulOk = await runCase("graceful", "SIGTERM");
const preflightOk = await runPreflightCase();
const ok = gracefulOk && preflightOk;
console.log(`[teardown-check] verdict: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
