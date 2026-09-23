#!/usr/bin/env bun
/**
 * Production regression stack (ADR 0009): builds every workspace once, serves
 * the dists statically, generates a localhost-origins runtime config, and
 * boots the real production host (`bos start --config-path`). No dev servers,
 * no watchers, no FastKV, no NEAR credentials — CI validates the artifacts
 * the branch produces.
 *
 * Usage: bun tests/regression/lib/prod-stack.mjs <ssr|csr>
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { sanitizeContainerName } from "../../../packages/every-plugin/src/ui/manifest/contract";
import { prepareLocalProductionConfig } from "../../../packages/everything-dev/src/local-prod-config";
import { computeRegressionEnv } from "./regression-env.mjs";
import { startStaticServer, stopStaticServer } from "./static-server.mjs";

const variant = process.argv[2];
if (!["ssr", "csr"].includes(variant)) {
  console.error(`usage: prod-stack.mjs <ssr|csr> (got: ${variant ?? "nothing"})`);
  process.exit(1);
}

const log = (...lines) => console.log(`[prod-stack:${variant}]`, ...lines);
const regressionEnv = computeRegressionEnv();
const root = regressionEnv.repoRoot;
const basePort = regressionEnv.basePort;

// Same allocation scheme as the dev stack: no dev servers exist in this stack,
// so the standard regression ports are free for the static dist servers.
const ports = {
  hostDist: basePort + 5,
  api: basePort + 1,
  auth: basePort + 2,
  ui: basePort + 3,
  authUi: basePort + 4,
};

const bosConfig = JSON.parse(await readFile(path.join(root, "bos.config.json"), "utf8"));
// [key, local workspace path] — the path comes from the config's `local:` value
const localPlugins = Object.entries(bosConfig.plugins ?? {})
  .filter(
    ([, ref]) =>
      typeof ref === "object" &&
      typeof ref.development === "string" &&
      ref.development.startsWith("local:"),
  )
  .map(([key, ref]) => [key, ref.development.slice("local:".length)])
  .sort(([a], [b]) => a.localeCompare(b));
const pluginPorts = new Map(localPlugins.map(([key], index) => [key, basePort + 10 + index]));

const run = (cmd, args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`)),
    );
  });

const build = async () => {
  if (process.env.BOS_REGRESSION_SKIP_BUILD === "1") {
    log("skipping builds (BOS_REGRESSION_SKIP_BUILD=1)");
    return;
  }
  log("building every-plugin + everything-dev (prod cli)…");
  await run("bun", ["run", "--cwd", "packages/every-plugin", "build"]);
  await run("bun", ["run", "--cwd", "packages/everything-dev", "build"]);
  log("building host dist…");
  await run("bun", ["run", "--cwd", "host", "build"], {
    env: { BOS_CONFIG_PATH: path.join(root, "bos.config.json") },
  });
  log("building core ui (web + ssr)…");
  await run("bun", ["run", "--cwd", "ui", "build"], {
    env: { BOS_CONFIG_PATH: path.join(root, "bos.config.json") },
  });
  log("building api remote…");
  await run("bun", ["run", "--cwd", "api", "build"]);
  for (const [key, workspace] of localPlugins) {
    log(`building plugin ${key} (api remote${key === "auth" ? " + ui" : ""})…`);
    await run("bun", ["run", "--cwd", workspace, "build"]);
  }
};

await build();

const servers = [];
const serve = async (rootDir, port) => {
  servers.push(await startStaticServer(rootDir, port));
  log(`serving ${path.relative(root, rootDir)} → http://localhost:${port}`);
};

await serve(path.join(root, "host", "dist"), ports.hostDist);
await serve(path.join(root, "ui", "dist"), ports.ui);
await serve(path.join(root, "api", "dist"), ports.api);
await serve(path.join(root, "plugins", "auth", "dist"), ports.auth);
await serve(path.join(root, "plugins", "auth", "ui", "dist"), ports.authUi);
for (const [key, workspace] of localPlugins) {
  if (key === "auth") continue;
  await serve(path.join(root, workspace, "dist"), pluginPorts.get(key));
}

const resolvedConfig = prepareLocalProductionConfig(bosConfig, {
  host: `http://localhost:${ports.hostDist}`,
  ui: {
    production: `http://localhost:${ports.ui}`,
    ...(variant === "ssr" ? { ssr: `http://localhost:${ports.ui}/ssr` } : {}),
  },
  api: `http://localhost:${ports.api}`,
  auth: `http://localhost:${ports.auth}`,
  authUi: {
    production: `http://localhost:${ports.authUi}`,
    ...(variant === "ssr" ? { ssr: `http://localhost:${ports.authUi}/ssr` } : {}),
    // The composed ui source must register under the BUILT container name —
    // the authored ui.name can never match it (ADR 0009; the sanitized
    // package name is the build's identity, same rule the dev runtime derives).
    name: sanitizeContainerName(
      JSON.parse(await readFile(path.join(root, "plugins", "auth", "package.json"), "utf8")).name,
    ),
  },
  plugins: Object.fromEntries(
    localPlugins.map(([key]) => [key, { production: `http://localhost:${pluginPorts.get(key)}` }]),
  ),
});

const configDir = path.join(root, ".bos", "regression");
await mkdir(configDir, { recursive: true });
const configPath = path.join(configDir, `bos.prod-${variant}.json`);
await writeFile(configPath, `${JSON.stringify(resolvedConfig, null, 2)}\n`);
log(`resolved config written to ${path.relative(root, configPath)}`);

const child = spawn(
  process.execPath,
  [
    "./node_modules/everything-dev/dist/cli.mjs",
    "start",
    "--config-path",
    configPath,
    "--no-interactive",
    "--port",
    String(basePort),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      ...regressionEnv.dbUrls,
      BETTER_AUTH_SECRET: regressionEnv.authSecret,
      BASE_URL: regressionEnv.baseUrl,
      CORS_ORIGIN: regressionEnv.baseUrl,
      BOS_NO_PERSIST_PORTS: "1",
    },
  },
);

const teardown = (signal = "SIGTERM") => {
  try {
    child.kill(signal);
  } catch {
    /* already gone */
  }
  for (const server of servers) void stopStaticServer(server);
};
process.on("SIGTERM", () => teardown());
process.on("SIGINT", () => teardown());
process.on("exit", () => {
  try {
    child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
});
child.on("exit", (code) => {
  for (const server of servers) void stopStaticServer(server);
  process.exitCode = code ?? 1;
});

const deadline = Date.now() + 180_000;
let ready = false;
while (Date.now() < deadline && !ready) {
  try {
    const res = await fetch(`${regressionEnv.baseUrl}/health`);
    ready = res.ok;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
if (!ready) {
  console.error(
    `[prod-stack:${variant}] host never became healthy at ${regressionEnv.baseUrl}/health`,
  );
  teardown();
  process.exit(1);
}
log(`production stack (${variant}) ready at ${regressionEnv.baseUrl}`);
