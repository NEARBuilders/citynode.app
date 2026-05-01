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

  const { sourceDir, cleanup } = await resolveSourceDir({ extendsAccount, extendsGateway });

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

    const snapshot = await readSnapshot(projectDir);

    const updated: string[] = [];
    const skipped: string[] = [];
    const added: string[] = [];

    for (const filePath of allTemplateFiles) {
      if (isExcluded(filePath, excludePatterns)) continue;

      const localHash = computeLocalHash(projectDir, filePath);
      const sourceContent = readFileSync(join(sourceDir, filePath));
      const sourceHash = createHash("sha256").update(sourceContent).digest("hex").substring(0, 16);

      if (localHash === null) {
        added.push(filePath);
        continue;
      }

      if (localHash === sourceHash) continue;

      const snapshotHash = snapshot?.files[filePath];

      if (snapshotHash === undefined) {
        updated.push(filePath);
        continue;
      }

      if (localHash === snapshotHash) {
        updated.push(filePath);
      } else {
        if (options.force) {
          updated.push(filePath);
        } else {
          skipped.push(filePath);
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

    if (filesToWrite.length > 0) {
      backupFiles(projectDir, filesToWrite);

      for (const filePath of filesToWrite) {
        const src = join(sourceDir, filePath);
        const dest = join(projectDir, filePath);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, readFileSync(src));
      }
    }

    const newSnapshotFiles: Record<string, string> = {};
    for (const filePath of allTemplateFiles) {
      const src = join(sourceDir, filePath);
      const stat = lstatSync(src);
      if (!stat.isFile()) continue;
      const content = readFileSync(src);
      newSnapshotFiles[filePath] = createHash("sha256")
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
