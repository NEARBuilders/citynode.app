#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";

const FRAMEWORK_PACKAGES = ["every-plugin", "everything-dev"];
const PACKAGES_DIR = join(import.meta.dirname, "..", "packages");

function readPkg(dir: string) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as Record<string, unknown>;
}

const versions: Record<string, string> = {};
for (const name of FRAMEWORK_PACKAGES) {
  const pkgDir = join(PACKAGES_DIR, name);
  const pkg = readPkg(pkgDir);
  versions[name] = pkg.version as string;
}

console.log("Resolved versions:", versions);

const files = await glob("**/package.json", {
  cwd: `${import.meta.dirname}/..`,
  nodir: true,
  dot: false,
  absolute: true,
  ignore: ["**/node_modules/**", "packages/*/package.json"],
});

for (const filePath of files) {
  const content = readFileSync(filePath, "utf-8");
  if (
    !content.includes("workspace:*") &&
    !content.includes('"packages/every-plugin"') &&
    !content.includes('"packages/everything-dev"')
  ) {
    continue;
  }

  const pkg = JSON.parse(content) as Record<string, unknown>;
  let modified = false;

  for (const depField of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkg[depField];
    if (!deps || typeof deps !== "object") continue;
    const map = deps as Record<string, string>;
    for (const name of FRAMEWORK_PACKAGES) {
      if (map[name] === "workspace:*" || map[name]?.startsWith("catalog:")) {
        map[name] = `^${versions[name]}`;
        modified = true;
      }
    }
  }

  if (pkg.workspaces && typeof pkg.workspaces === "object") {
    const ws = pkg.workspaces as { packages?: string[] };
    if (Array.isArray(ws.packages)) {
      const before = ws.packages.length;
      ws.packages = ws.packages.filter(
        (p: string) => p !== "packages/every-plugin" && p !== "packages/everything-dev",
      );
      if (ws.packages.length !== before) modified = true;
    }
  }

  if (modified) {
    writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`  Updated: ${filePath}`);
  }
}

console.log("Workspace refs resolved to npm versions.");
