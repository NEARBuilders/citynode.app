import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execa } from "execa";
import { globSync } from "glob";

type FrameworkTarballs = {
  "every-plugin": string;
  "everything-dev": string;
};

let tarballsPromise: Promise<FrameworkTarballs> | null = null;

export function getFrameworkTarballs(repoRoot: string): Promise<FrameworkTarballs> {
  tarballsPromise ??= buildFrameworkTarballs(repoRoot);
  return tarballsPromise;
}

async function buildFrameworkTarballs(repoRoot: string): Promise<FrameworkTarballs> {
  const tarballDir = mkdtempSync(join(tmpdir(), "everything-dev-framework-packages-"));

  await execa("bun", ["run", "--cwd", "packages/every-plugin", "build"], { cwd: repoRoot });
  await execa("bun", ["run", "--cwd", "packages/everything-dev", "build"], { cwd: repoRoot });

  const everyPluginTarball = await packWorkspace(
    join(repoRoot, "packages", "every-plugin"),
    tarballDir,
  );
  const everythingDevTarball = await packWorkspace(
    join(repoRoot, "packages", "everything-dev"),
    tarballDir,
  );

  return {
    "every-plugin": everyPluginTarball,
    "everything-dev": everythingDevTarball,
  };
}

async function packWorkspace(workspaceDir: string, tarballDir: string): Promise<string> {
  const { stdout } = await execa("npm", ["pack", "--pack-destination", tarballDir], {
    cwd: workspaceDir,
  });
  const tarballName = stdout.trim().split("\n").at(-1);
  if (!tarballName) {
    throw new Error(`npm pack did not return a tarball name for ${workspaceDir}`);
  }
  return join(tarballDir, tarballName);
}

export function rewriteFrameworkPackageSpecs(projectDir: string, tarballs: FrameworkTarballs) {
  const packageJsonPaths = globSync("**/package.json", {
    cwd: projectDir,
    nodir: true,
    dot: false,
    absolute: false,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/.bos/**"],
  });

  for (const packageJsonRel of packageJsonPaths) {
    const packageJsonPath = join(projectDir, packageJsonRel);
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as Record<string, unknown>;
    let changed = false;

    for (const [name, tarballPath] of Object.entries(tarballs)) {
      const spec = pathToFileURL(tarballPath).href;
      for (const section of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ] as const) {
        const deps = pkg[section];
        if (!deps || typeof deps !== "object") continue;
        const record = deps as Record<string, string>;
        if (!(name in record)) continue;
        record[name] = spec;
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }
}
