import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Newest mtime under src (recursive) — the staleness oracle for the ui dist. */
function newestSourceMtime(srcDir: string, floor = 0): number {
  let newest = floor;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const full = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      newest = newestSourceMtime(full, newest);
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

function ensureUiBuild(repoRoot: string) {
  const uiDir = path.join(repoRoot, "ui");
  const distDir = path.join(uiDir, "dist");
  const srcDir = path.join(uiDir, "src");
  const clientEntry = path.join(distDir, "remoteEntry.js");
  const ssrEntry = path.join(distDir, "remoteEntry.server.js");

  const hasClient = existsSync(clientEntry) && statSync(clientEntry).size > 0;
  const hasSsr = existsSync(ssrEntry) && statSync(ssrEntry).size > 0;
  // A dist that predates any src file is stale — same missing-or-stale
  // contract the build train applies to its quiet prerequisites.
  const stale =
    existsSync(srcDir) &&
    newestSourceMtime(srcDir) > (hasClient ? statSync(clientEntry).mtimeMs : 0);

  if (hasClient && hasSsr && !stale) return;

  // Through the build train (quiet, staleness-checked prerequisites +
  // the ui target). BOS_SSR=1 forces the ui's SSR node environment even
  // under the train's development-mode NODE_ENV — host tests exercise the
  // SSR container path, so both dists must exist.
  const result = spawnSync("bun", ["run", "build", "ui"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, BOS_SSR: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`UI build failed (exit ${result.status ?? "unknown"})`);
  }
}

export default async function globalSetup() {
  const repoRoot = path.resolve(__dirname, "../..");

  ensureUiBuild(repoRoot);
}
