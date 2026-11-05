// Preflight for the browser regression suites — runs BEFORE playwright so its
// webServer URL check never sees a stale stack holding the regression ports.
import { killStalePorts } from "./kill-stale-ports.mjs";
import { computeRegressionEnv, findRepoRoot } from "./regression-env.mjs";

const root = findRepoRoot();
if (!root) {
  console.error("[preflight] no authored config (bos.app.ts) found in any parent directory");
  process.exit(1);
}

const env = computeRegressionEnv({ repoRoot: root });
killStalePorts(env.stalePorts);
