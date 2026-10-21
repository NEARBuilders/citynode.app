// Preflight for the browser regression suites — runs BEFORE playwright so its
// webServer URL check never sees a stale stack or a down database:
//   1. kill stale stack processes holding the regression ports
//   2. bring up every compose postgres (test DBs + the main postgres the
//      plugin DBs resolve to) — waitForDatabases then only has to confirm
import { spawnSync } from "node:child_process";
import { computeRegressionEnv, findRepoRoot } from "./regression-env.mjs";
import { killStalePorts } from "./kill-stale-ports.mjs";

const root = findRepoRoot();
if (!root) {
  console.error("[preflight] no authored config (bos.app.ts) found in any parent directory");
  process.exit(1);
}

const env = computeRegressionEnv({ repoRoot: root });
killStalePorts(env.stalePorts);

// CI provides its own postgres services (and .env.test maps every plugin DB to
// them) — compose is a local-dev convenience only.
if (!process.env.CI) {
  const compose = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
    cwd: root,
    encoding: "utf8",
  });
  if (compose.status !== 0) {
    console.warn(
      "[preflight] docker compose up failed — start Docker Desktop, then run `pnpm run test:db:up` manually. " +
        String(compose.stderr ?? compose.stdout ?? "").trim(),
    );
  }
}
