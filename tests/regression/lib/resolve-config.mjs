import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { openResolution } from "everything-dev/resolution";

// Writes the resolved config the regression helpers read. Checkouts that
// never ran a bos command get it on demand — the helpers need it before
// reset-plugin-dbs / regression-env run.
const root = resolve(import.meta.dirname, "../../..");

const typesGen = spawnSync("pnpm", ["exec", "bos", "types", "gen"], {
  cwd: root,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (typesGen.status !== 0) {
  throw new Error(
    `Failed to resolve the authored config (bos types gen exited ${typesGen.status}):\n${
      typesGen.stderr ?? typesGen.stdout ?? ""
    }`,
  );
}

// `bos types gen` resolves in memory only (it emits type stubs but never
// materializes the resolved config — that is `bos dev`/`bos build`'s job,
// which have not run in a fresh checkout). Resolve here and write the file
// the regression helpers read (ADR 0005), same shape `bos dev` writes.
const session = await openResolution({ cwd: root, env: "development" });
if (!session?.config) {
  throw new Error("Failed to resolve the authored config (openResolution returned no config)");
}
const out = join(root, ".bos", "bos.resolved-config.json");
mkdirSync(dirname(out), { recursive: true });
const output = {
  _resolved: {
    env: "development",
    resolvedAt: new Date().toISOString(),
    extendsChain: session.chain ?? [],
  },
  ...session.config,
};
writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(`[resolve-config] wrote ${out}`);
