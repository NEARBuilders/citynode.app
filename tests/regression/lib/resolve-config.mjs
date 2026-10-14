import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Writes the resolved config the regression helpers read. Checkouts that
// never ran a bos command get it on demand — the helpers need it before
// reset-plugin-dbs / regression-env run.
const root = resolve(import.meta.dirname, "../../..");

const result = spawnSync("pnpm", ["exec", "bos", "types", "gen"], {
  cwd: root,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (result.status !== 0) {
  throw new Error(
    `Failed to resolve the authored config (bos types gen exited ${result.status}):\n${
      result.stderr ?? result.stdout ?? ""
    }`,
  );
}

// bos writes the generated resolved config to the repo root; mirror it to the
// .bos/ path the regression helpers read first.
const generated = join(root, "bos.config.json");
if (!existsSync(generated)) {
  throw new Error("bos types gen did not write bos.config.json");
}
const out = join(root, ".bos", "bos.resolved-config.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(JSON.parse(readFileSync(generated, "utf-8")), null, 2)}\n`);
console.log(`[resolve-config] wrote ${out}`);
