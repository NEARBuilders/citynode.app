import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { glob } from "glob";
import type { SyncOptions, SyncResult } from "../contract";
import { personalizeConfig, readTemplatekeep, resolveSourceDir, runBunInstall } from "./init";
import { readSnapshot, writeSnapshot } from "./snapshot";

function readExcludeFile(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export async function readTemplatesyncExclude(sourceDir: string): Promise<string[]> {
  return readExcludeFile(join(sourceDir, ".templatesync-exclude"));
}

export function readLocalSyncExcludes(projectDir: string): string[] {
  return readExcludeFile(join(projectDir, ".bos", "sync-local-exclude"));
}

function isExcluded(filePath: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (filePath.startsWith(`${prefix}/`) || filePath === prefix) return true;
    } else if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      const slashIdx = filePath.indexOf("/", prefix.length + 1);
      if (filePath.startsWith(`${prefix}/`) && slashIdx === -1) return true;
    } else if (filePath === pattern || filePath.startsWith(`${pattern}/`)) {
      return true;
    }
  }
  return false;
}

function computeLocalHash(projectDir: string, filePath: string): string | null {
  const fullPath = join(projectDir, filePath);
  if (!existsSync(fullPath)) return null;
  try {
    const content = readFileSync(fullPath);
    return createHash("sha256").update(content).digest("hex").substring(0, 16);
  } catch {
    return null;
  }
}

function backupFiles(projectDir: string, filePaths: string[]): string | null {
  const filesToBackup = filePaths.filter((f) => existsSync(join(projectDir, f)));
  if (filesToBackup.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(projectDir, ".bos", "sync-backup", timestamp);

  for (const filePath of filesToBackup) {
    const src = join(projectDir, filePath);
    const dest = join(backupDir, filePath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }

  return backupDir;
}

function mergePackageJson(
  local: Record<string, unknown>,
  template: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...template };

  for (const depField of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const localDeps = local[depField] as Record<string, string> | undefined;
    const templateDeps = template[depField] as Record<string, string> | undefined;

    if (!localDeps && !templateDeps) continue;

    const mergedDeps: Record<string, string> = { ...(templateDeps ?? {}) };

    if (localDeps) {
      for (const [name, version] of Object.entries(localDeps)) {
        if (!(name in mergedDeps)) {
          mergedDeps[name] = version;
        }
      }
    }

    if (Object.keys(mergedDeps).length > 0) {
      merged[depField] = mergedDeps;
    }
  }

  if (local.scripts && typeof local.scripts === "object") {
    merged.scripts = {
      ...((template.scripts as Record<string, string>) ?? {}),
      ...(local.scripts as Record<string, string>),
    };
  }

  return merged;
}

function toDestPath(filePath: string): string {
  return filePath.startsWith(".templates/") ? filePath.slice(".templates/".length) : filePath;
}

function writeSyncedFile(sourceDir: string, projectDir: string, filePath: string): void {
  const src = join(sourceDir, filePath);
  const destPath = filePath.startsWith(".templates/")
    ? filePath.slice(".templates/".length)
    : filePath;
  const dest = join(projectDir, destPath);
  mkdirSync(dirname(dest), { recursive: true });

  if (filePath.endsWith("package.json")) {
    const localContent = existsSync(dest) ? readFileSync(dest, "utf-8") : null;
    const templateContent = readFileSync(src, "utf-8");

    if (localContent) {
      const local = JSON.parse(localContent) as Record<string, unknown>;
      const template = JSON.parse(templateContent) as Record<string, unknown>;
      const merged = mergePackageJson(local, template);
      writeFileSync(dest, `${JSON.stringify(merged, null, 2)}\n`);
      return;
    }
  }

  writeFileSync(dest, readFileSync(src));
}

export async function syncTemplate(projectDir: string, options: SyncOptions): Promise<SyncResult> {
  const localConfig = JSON.parse(
    readFileSync(join(projectDir, "bos.config.json"), "utf-8"),
  ) as Record<string, unknown>;

  const extendsRef = localConfig.extends as string | undefined;
  if (!extendsRef?.startsWith("bos://")) {
    return {
      status: "error",
      updated: [],
      skipped: [],
      added: [],
      error: "No extends field found in bos.config.json — cannot determine parent",
    };
  }

  const extendsMatch = extendsRef.match(/^bos:\/\/([^/]+)\/(.+)$/);
  if (!extendsMatch) {
    return {
      status: "error",
      updated: [],
      skipped: [],
      added: [],
      error: `Invalid extends reference: ${extendsRef}`,
    };
  }

  const extendsAccount = extendsMatch[1];
  const extendsGateway = extendsMatch[2];

  const { sourceDir, parentConfig, cleanup } = await resolveSourceDir({
    extendsAccount,
    extendsGateway,
  });

  try {
    const patterns = await readTemplatekeep(sourceDir);
    if (patterns.length === 0) {
      return {
        status: "error",
        updated: [],
        skipped: [],
        added: [],
        error: "No .templatekeep found in template source",
      };
    }

    const parentExcludes = await readTemplatesyncExclude(sourceDir);
    const localExcludes = readLocalSyncExcludes(projectDir);
    const excludePatterns = [...parentExcludes, ...localExcludes];

    const allTemplateFiles = new Set<string>();
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: sourceDir,
        nodir: true,
        dot: true,
        absolute: false,
      });
      for (const match of matches) {
        allTemplateFiles.add(match);
      }
    }

    const childPlugins =
      localConfig.plugins && typeof localConfig.plugins === "object"
        ? Object.keys(localConfig.plugins as Record<string, unknown>)
        : [];

    const pluginRoutes: Record<string, string[]> = {};
    if (parentConfig.plugins) {
      for (const [key, ref] of Object.entries(parentConfig.plugins)) {
        if (ref.routes && ref.routes.length > 0) {
          pluginRoutes[key] = ref.routes;
        }
      }
    }

    const excludedRoutePatterns: string[] = [];
    for (const [pluginKey, routePatterns] of Object.entries(pluginRoutes)) {
      if (!childPlugins.includes(pluginKey)) {
        excludedRoutePatterns.push(...routePatterns);
      }
    }

    const filteredFiles = new Set<string>();
    for (const filePath of allTemplateFiles) {
      const pluginMatch = filePath.match(/^plugins\/([^/]+)/);
      if (pluginMatch && !childPlugins.includes(pluginMatch[1])) continue;
      if (isExcluded(filePath, excludedRoutePatterns)) continue;
      filteredFiles.add(filePath);
    }

    for (const [pluginKey, routePatterns] of Object.entries(pluginRoutes)) {
      if (!childPlugins.includes(pluginKey)) continue;
      for (const rp of routePatterns) {
        const matches = await glob(rp, {
          cwd: sourceDir,
          nodir: true,
          dot: true,
          absolute: false,
        });
        for (const match of matches) {
          if (!isExcluded(match, excludedRoutePatterns)) {
            filteredFiles.add(match);
          }
        }
      }
    }

    const snapshot = await readSnapshot(projectDir);

    const updated: string[] = [];
    const skipped: string[] = [];
    const added: string[] = [];

    for (const filePath of filteredFiles) {
      const destPath = toDestPath(filePath);
      if (isExcluded(destPath, excludePatterns)) continue;

      const localHash = computeLocalHash(projectDir, destPath);
      const sourceContent = readFileSync(join(sourceDir, filePath));
      const sourceHash = createHash("sha256").update(sourceContent).digest("hex").substring(0, 16);

      if (localHash === null) {
        added.push(destPath);
        continue;
      }

      if (localHash === sourceHash) continue;

      const snapshotHash = snapshot?.files[destPath];

      if (snapshotHash === undefined) {
        updated.push(destPath);
        continue;
      }

      if (localHash === snapshotHash) {
        updated.push(destPath);
      } else {
        if (options.force) {
          updated.push(destPath);
        } else {
          skipped.push(destPath);
        }
      }
    }

    if (options.dryRun) {
      return {
        status: "dry-run",
        updated,
        skipped,
        added,
      };
    }

    const filesToWrite = [...updated, ...added].filter((f) => !isExcluded(f, excludePatterns));

    const destToSource = new Map<string, string>();
    for (const filePath of filteredFiles) {
      destToSource.set(toDestPath(filePath), filePath);
    }

    if (filesToWrite.length > 0) {
      backupFiles(projectDir, filesToWrite);

      for (const destPath of filesToWrite) {
        const sourcePath = destToSource.get(destPath) ?? destPath;
        writeSyncedFile(sourceDir, projectDir, sourcePath);
      }
    }

    const newSnapshotFiles: Record<string, string> = {};
    for (const filePath of filteredFiles) {
      const src = join(sourceDir, filePath);
      const stat = lstatSync(src);
      if (!stat.isFile()) continue;
      const content = readFileSync(src);
      newSnapshotFiles[toDestPath(filePath)] = createHash("sha256")
        .update(content)
        .digest("hex")
        .substring(0, 16);
    }

    await writeSnapshot(projectDir, {
      parentRef: `bos://${extendsAccount}/${extendsGateway}`,
      files: newSnapshotFiles,
    });

    const account = (localConfig.account as string) || extendsAccount;
    const domain = (localConfig.domain as string) || extendsGateway;

    await personalizeConfig(projectDir, {
      extendsAccount,
      extendsGateway,
      account,
      domain,
      plugins: childPlugins,
      pluginRoutes,
      workspaceOpts: { sourceDir },
    });

    if (!options.noInstall) {
      await runBunInstall(projectDir);
    }

    return {
      status: "synced",
      updated,
      skipped,
      added,
    };
  } finally {
    await cleanup();
  }
}
