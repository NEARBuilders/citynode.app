# Plan: `bos init` Command + E2E Test

> Generic project scaffolding from any bos-configured repo. Uses FastKV lookup + GitHub tarball + `.templatekeep` filtering.

## Overview

`bos init` creates a new project by:

1. **FastKV lookup**: Given `--account` + `--gateway`, fetches the parent's `bos.config.json` from `bos://{account}/{gateway}` via FastKV
2. **Tarball download**: Reads `repository` from the parent config, downloads tarball from GitHub
3. **Filter**: Applies `.templatekeep` (inclusion-only) from the extracted source
4. **Personalize**: Writes new `bos.config.json` with user's account/domain + `extends: "bos://{parentAccount}/{gateway}"`
5. **Install**: Runs `bun install` in the destination

**Any repo** with a `bos.config.json` + `.templatekeep` can be a template source. Not specific to everything-dev.

## Typical Usage

```bash
# Scaffold from the everything.dev template
bos init --account dev.everything.near --gateway everything.dev ./my-project

# With interactive prompts
bos init ./my-project

# Override new project's account/domain
bos init --account myapp.near --domain myapp.dev --account dev.everything.near --gateway everything.dev ./my-project

# Local source (for testing/CI, skips GitHub download)
bos init --source ./ ./my-project --new-account test.near --new-domain test.dev --no-interactive

# Include host/ in output (remote by default)
bos init --with-host ./my-project
```

Wait — the `--account` flag is ambiguous (parent account vs new project account). Let me refine the flags:

```
--account    Parent NEAR account to extend from (required)
--gateway    Parent gateway/site ID to extend from (required)
--name       New project NEAR account (interactive prompt or flag)
--domain     New project domain (interactive prompt or flag)
--source     Override: local dir path instead of GitHub tarball
--with-host  Include host/ in output
--no-interactive  Skip prompts, use flags only
--no-install      Skip bun install
```

So the full command is:

```bash
bos init --account dev.everything.near --gateway everything.dev --name myapp.near --domain myapp.dev ./my-project
```

## Design Decisions

- **Template source**: Always determined by `--account` + `--gateway` → FastKV lookup → parent bos.config.json → `repository` field → GitHub tarball
- **No degit dependency**: Custom tarball download using GitHub API + Node streams
- **`--source` flag**: Accepts a local directory path, skips FastKV + GitHub download. Used for e2e testing and offline CI.
- **Interactivity**: Interactive prompts for `--name`, `--domain`, destination if not provided. Flag overrides skip prompts.
- **`.templatekeep` location**: Repo root of the template source, inclusion-based
- **Extends**: Auto-sets `extends: "bos://{parentAccount}/{gateway}"` from the `--account` + `--gateway` flags
- **Test location**: `packages/everything-dev/tests/integration/`

## Source Resolution Flow

```
bos init --account dev.everything.near --gateway everything.dev ./my-project

  ┌─ --source flag provided?
  │   YES → use local dir as source (skip steps 1-3)
  │   NO  → continue
  │
  ├─ Step 1: FastKV lookup
  │   Fetch bos.config.json from bos://dev.everything.near/everything.dev
  │   Read parent config: { repository, account, domain, app, plugins, ... }
  │
  ├─ Step 2: Parse repository URL
  │   "https://github.com/nearbuilders/everything-dev"
  │   → owner: "nearbuilders", repo: "everything-dev", branch: "main"
  │
  ├─ Step 3: Download tarball
  │   GET https://api.github.com/repos/nearbuilders/everything-dev/tarball/main
  │   Extract to os.tmpdir()
  │   GitHub tarballs have a top-level dir like "nearbuilders-everything-dev-abc1234/"
  │   Resolve to the actual source directory
  │
  └─ Source directory ready → continue to filtering
```

## Files to Create/Modify

### 1. `.templatekeep` (repo root)

Inclusion list — only these files/dirs appear in the template output:

```
# Root config
bos.config.json
package.json
.env.example
biome.json
bunfig.toml

# Deployment
Dockerfile
railway.json

# Agent/docs
.agent/
AGENTS.md

# UI — structural + auth
ui/package.json
ui/rsbuild.config.ts
ui/tsconfig.json
ui/public/**
ui/src/hydrate.tsx
ui/src/router.tsx
ui/src/router.server.tsx
ui/src/styles.css
ui/src/globals.d.ts
ui/src/app.ts
ui/src/api-contract.ts
ui/src/components/index.ts
ui/src/components/ui/**
ui/src/components/error-boundary.tsx
ui/src/components/loading.tsx
ui/src/components/theme-toggle.tsx
ui/src/providers/index.tsx
ui/src/hooks/index.ts
ui/src/hooks/use-client.ts
ui/src/types/index.ts
ui/src/lib/api-client.ts
ui/src/lib/auth-client.ts
ui/src/lib/session.ts
ui/src/lib/utils.ts
ui/src/lib/use-api-client.ts
ui/src/routes/__root.tsx
ui/src/routes/_layout.tsx
ui/src/routes/_layout/_authenticated.tsx
ui/src/routes/_layout/_admin/**
ui/src/routes/_layout/login.tsx
ui/src/routes/_layout/index.tsx

# API — thin structural shell
api/package.json
api/rspack.config.js
api/plugin.dev.ts
api/tsconfig.json
api/tsconfig.contract.json
api/src/contract.ts
api/src/index.ts
api/src/db/index.ts
api/src/db/layer.ts
api/src/db/schema.ts

# Plugin template
plugins/_template/**

# Plugins — business (included so downstream can extend)
plugins/registry/**
plugins/projects/**
```

**Excluded** (not in `.templatekeep`):
- `host/` — remote by default, included only with `--with-host`
- Business UI routes: `apps/`, `keys/`, `organizations/`, `home.tsx`, `about.tsx`, `projects.*`, `opencode.tsx`
- `packages/` — framework packages
- `.bos/`, `plans/`, `.changeset/`, `.opencode/`

### 2. Contract: `packages/everything-dev/src/contract.ts`

Add `init` route:

```ts
export const InitOptionsSchema = z.object({
  account: z.string(),                     // Parent NEAR account (e.g., "dev.everything.near")
  gateway: z.string(),                     // Parent gateway ID (e.g., "everything.dev")
  destination: z.string().optional(),       // Target directory (defaults to ./gateway)
  name: z.string().optional(),             // New project NEAR account
  domain: z.string().optional(),            // New project domain
  source: z.string().optional(),            // Override: local dir path (skips GitHub download)
  withHost: z.boolean().default(false),     // Include host/ in output
  noInteractive: z.boolean().default(false),// Skip prompts
  noInstall: z.boolean().default(false),    // Skip bun install
});

export const InitResultSchema = z.object({
  status: z.enum(["initialized", "error"]),
  destination: z.string(),
  parentAccount: z.string(),
  parentGateway: z.string(),
  name: z.string().optional(),
  domain: z.string().optional(),
  extends: z.string(),
  filesCopied: z.number(),
  error: z.string().optional(),
});
```

### 3. Contract Metadata: `packages/everything-dev/src/contract.meta.ts`

```ts
init: {
  commandPath: ["init"],
  summary: "Scaffold a new project from a bos template",
  interactive: true,
  fields: {
    account: { positional: true, description: "Parent NEAR account (e.g., dev.everything.near)" },
    gateway: { positional: true, description: "Parent gateway ID (e.g., everything.dev)" },
    destination: { description: "Target directory (defaults to ./gateway)" },
    name: { description: "New project NEAR account" },
    domain: { description: "New project domain" },
    source: { description: "Local source dir (skips GitHub download)" },
    withHost: { description: "Include host/ in template output" },
    noInteractive: { description: "Skip prompts, use flags only" },
    noInstall: { description: "Skip bun install" },
  },
},
```

### 4. Core Logic: `packages/everything-dev/src/cli/init.ts`

```ts
export async function resolveSourceDir(opts: {
  account: string;
  gateway: string;
  source?: string;
}): Promise<{ sourceDir: string; parentConfig: BosConfig; cleanup: () => Promise<void> }>
// If opts.source provided:
//   - Use local dir directly
//   - Read parentConfig from source/bos.config.json
//   - cleanup is no-op
// If no source:
//   - Fetch parent bos.config.json from FastKV at bos://{account}/{gateway}
//   - Parse repository URL from parent config
//   - Download GitHub tarball to temp dir
//   - Extract (handle GitHub's top-level dir prefix)
//   - cleanup removes temp dir

export async function fetchParentConfig(account: string, gateway: string): Promise<BosConfig>
// - Uses existing fetchBosConfigFromFastKv from packages/everything-dev/src/fastkv.ts
// - Resolves bos://{account}/{gateway} to a BosConfig object

export async function downloadTarball(repoUrl: string): Promise<{ dir: string; cleanup: () => Promise<void> }>
// - Parse GitHub URL → owner/repo/branch
// - GET https://api.github.com/repos/{owner}/{repo}/tarball/{branch}
// - Pipe response through zlib.createUnzip() → tar extraction to tmpdir
// - Resolve the single top-level directory GitHub creates
// - Return { dir: actualSourceDir, cleanup: rmDir }
// - No external dependency — pure Node streams + zlib

export async function readTemplatekeep(sourceDir: string): Promise<string[]>
// - Read .templatekeep from sourceDir root
// - Parse: one pattern per line, strip comments (#) and blanks
// - Return patterns array

export async function copyFilteredFiles(
  sourceDir: string,
  destination: string,
  patterns: string[],
  options: { withHost: boolean }
): Promise<number>
// - Glob each pattern against sourceDir
// - Copy matching files to destination (preserving directory structure)
// - If withHost is false, skip patterns matching host/**
// - Return count of files copied

export async function personalizeConfig(
  destination: string,
  opts: {
    parentAccount: string;
    parentGateway: string;
    name?: string;
    domain?: string;
  }
): Promise<void>
// - Read bos.config.json from destination
// - Set extends: `bos://${parentAccount}/${parentGateway}`
// - Set account to opts.name if provided
// - Set domain to opts.domain if provided
// - Remove production URLs from app entries (inherited via extends)
// - Remove productionIntegrity fields
// - Write updated config

export async function runBunInstall(destination: string): Promise<void>
// - Spawn `bun install` in destination
// - Throw on non-zero exit
```

### 5. Handler: `packages/everything-dev/src/plugin.ts`

```ts
init: builder.init.handler(async ({ input, context }) => {
  const { bosConfig } = context;

  // 1. Resolve source directory (local or from GitHub)
  const { sourceDir, parentConfig, cleanup } = await resolveSourceDir({
    account: input.account,
    gateway: input.gateway,
    source: input.source,
  });

  try {
    // 2. Read .templatekeep
    const patterns = await readTemplatekeep(sourceDir);
    if (patterns.length === 0) {
      throw new Error("No .templatekeep found in template source");
    }

    // 3. Determine destination
    const destination = input.destination
      ?? (input.noInteractive ? input.gateway : await promptDestination(input.gateway));

    // 4. Copy filtered files
    const filesCopied = await copyFilteredFiles(sourceDir, destination, patterns, {
      withHost: input.withHost,
    });

    // 5. Get new project account/domain (interactive or from flags)
    const name = input.name
      ?? (input.noInteractive ? undefined : await promptName());
    const domain = input.domain
      ?? (input.noInteractive ? undefined : await promptDomain());

    // 6. Personalize bos.config.json
    await personalizeConfig(destination, {
      parentAccount: input.account,
      parentGateway: input.gateway,
      name,
      domain,
    });

    // 7. Install dependencies
    if (!input.noInstall && !input.noInteractive) {
      await runBunInstall(destination);
    }

    return {
      status: "initialized",
      destination: resolve(destination),
      parentAccount: input.account,
      parentGateway: input.gateway,
      name,
      domain,
      extends: `bos://${input.account}/${input.gateway}`,
      filesCopied,
    };
  } finally {
    await cleanup();
  }
})
```

### 6. CLI Output: `packages/everything-dev/src/cli.ts`

```ts
if (descriptor.key === "init") {
  console.log();
  console.log(colors.green(`${icons.ok} Project initialized`));
  console.log(`  ${colors.dim("Extends:")} ${result.extends}`);
  console.log(`  ${colors.dim("Destination:")} ${result.destination}`);
  if (result.name) console.log(`  ${colors.dim("Account:")} ${result.name}`);
  if (result.domain) console.log(`  ${colors.dim("Domain:")} ${result.domain}`);
  console.log(`  ${colors.dim("Files copied:")} ${result.filesCopied}`);
  console.log();
  console.log(colors.dim("  Next steps:"));
  console.log(colors.dim(`    cd ${result.destination}`));
  if (!input.noInstall) {
    console.log(colors.dim("    bos dev --host remote"));
  } else {
    console.log(colors.dim("    bun install"));
    console.log(colors.dim("    bos dev --host remote"));
  }
  console.log();
  return;
}
```

### 7. Tarball Download Implementation

No external dependency. Pure Node.js:

```ts
import { createWriteStream, createReadStream, mkdirSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createUnzip } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Option A: Use tar package (tiny, well-maintained)
// import tar from "tar";
// await pipeline(response.body, createUnzip(), tar.extract({ cwd: tmpDir }));

// Option B: Use Bun's built-in spawn to extract
// await Bun.spawn(["tar", "-xf", tarballPath, "-C", tmpDir]);
```

The `tar` npm package is ~50KB and widely used. Or Bun can shell out to `tar` which is available on macOS/Linux. For Windows compatibility, the `tar` npm package is better.

### 8. E2E Test: `packages/everything-dev/tests/integration/init.structure.test.ts`

**Fast test (~2s)** — structure + config validation only, no install:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSourceDir, readTemplatekeep, copyFilteredFiles, personalizeConfig } from "../../src/cli/init";

const REPO_ROOT = join(import.meta.dirname, "../../../../");  // walk up to repo root

describe("bos init — structure", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "bos-init-structure-"));
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reads .templatekeep patterns", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns).toContain("bos.config.json");
    expect(patterns).toContain("ui/src/lib/auth-client.ts");
  });

  it("copies only .templatekeep files", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    const filesCopied = await copyFilteredFiles(REPO_ROOT, testDir, patterns, { withHost: false });

    expect(filesCopied).toBeGreaterThan(0);

    // Included
    expect(existsSync(join(testDir, "bos.config.json"))).toBe(true);
    expect(existsSync(join(testDir, "api/src/contract.ts"))).toBe(true);
    expect(existsSync(join(testDir, "ui/src/lib/auth-client.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/_template/src/index.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/registry/src/index.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/projects/src/index.ts"))).toBe(true);

    // Excluded
    expect(existsSync(join(testDir, "host"))).toBe(false);
    expect(existsSync(join(testDir, "packages"))).toBe(false);
    expect(existsSync(join(testDir, "plans"))).toBe(false);
    expect(existsSync(join(testDir, ".changeset"))).toBe(false);
    expect(existsSync(join(testDir, "ui/src/routes/_layout/apps"))).toBe(false);
    expect(existsSync(join(testDir, "ui/src/routes/_layout/_authenticated/keys"))).toBe(false);
    expect(existsSync(join(testDir, "ui/src/routes/_layout/_authenticated/organizations"))).toBe(false);
  });

  it("personalizes bos.config.json", async () => {
    await personalizeConfig(testDir, {
      parentAccount: "dev.everything.near",
      parentGateway: "everything.dev",
      name: "test.near",
      domain: "test.dev",
    });

    const config = JSON.parse(readFileSync(join(testDir, "bos.config.json"), "utf8"));
    expect(config.account).toBe("test.near");
    expect(config.domain).toBe("test.dev");
    expect(config.extends).toBe("bos://dev.everything.near/everything.dev");
  });

  it("removes production URLs", () => {
    const config = JSON.parse(readFileSync(join(testDir, "bos.config.json"), "utf8"));
    expect(config.app.ui.production).toBeUndefined();
    expect(config.app.api.production).toBeUndefined();
    expect(config.app.ui.productionIntegrity).toBeUndefined();
    expect(config.app.api.productionIntegrity).toBeUndefined();
  });

  it("includes host when withHost is true", async () => {
    const hostTestDir = mkdtempSync(join(tmpdir(), "bos-init-host-"));
    try {
      const patterns = await readTemplatekeep(REPO_ROOT);
      // Add host/** pattern when withHost
      const hostPatterns = [...patterns, "host/**"];
      await copyFilteredFiles(REPO_ROOT, hostTestDir, hostPatterns, { withHost: true });
      expect(existsSync(join(hostTestDir, "host/src/program.ts"))).toBe(true);
    } finally {
      rmSync(hostTestDir, { recursive: true, force: true });
    }
  });
});
```

### 9. E2E Test: `packages/everything-dev/tests/integration/init.full.test.ts`

**Slow test (~30s)** — includes install + typecheck. Skipped in normal `bun test`, run in CI:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { readTemplatekeep, copyFilteredFiles, personalizeConfig, runBunInstall } from "../../src/cli/init";

const REPO_ROOT = join(import.meta.dirname, "../../../../");

function runCommand(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: "pipe" });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

describe("bos init — full (install + typecheck)", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "bos-init-full-"));
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("installs dependencies", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    await copyFilteredFiles(REPO_ROOT, testDir, patterns, { withHost: false });
    await personalizeConfig(testDir, {
      parentAccount: "dev.everything.near",
      parentGateway: "everything.dev",
      name: "test.near",
      domain: "test.dev",
    });
    await runBunInstall(testDir);
    expect(existsSync(join(testDir, "node_modules"))).toBe(true);
  });

  it("typechecks successfully", async () => {
    const exitCode = await runCommand("bun", ["typecheck"], testDir);
    expect(exitCode).toBe(0);
  });
});
```

## Execution Order

1. Create `.templatekeep` at repo root
2. Add `init` contract + schemas to `packages/everything-dev/src/contract.ts`
3. Add `init` metadata to `packages/everything-dev/src/contract.meta.ts`
4. Create `packages/everything-dev/src/cli/init.ts` with core logic:
   - `resolveSourceDir` (local + remote)
   - `fetchParentConfig` (reuses existing FastKV helpers)
   - `downloadTarball` (GitHub API + Node streams)
   - `readTemplatekeep` (parse inclusion patterns)
   - `copyFilteredFiles` (glob + copy)
   - `personalizeConfig` (rewrite bos.config.json)
   - `runBunInstall` (spawn bun)
   - Interactive prompt helpers
5. Add `init` handler to `packages/everything-dev/src/plugin.ts`
6. Add `tar` dependency to `packages/everything-dev/package.json` (for cross-platform extraction)
7. Add `init` output formatting to `packages/everything-dev/src/cli.ts`
8. Create `packages/everything-dev/tests/integration/init.structure.test.ts`
9. Create `packages/everything-dev/tests/integration/init.full.test.ts`
10. Run structure test, iterate until passing
11. Run full test (slow), iterate until passing

## No External Degit Dependency

Instead of `degit`, we use:

1. **`fetchBosConfigFromFastKv`** — already exists in `packages/everything-dev/src/fastkv.ts`
2. **GitHub tarball API** — `https://api.github.com/repos/{owner}/{repo}/tarball/{branch}`
3. **`tar` npm package** — ~50KB, cross-platform tar extraction (or shell out to `tar` on Unix)

This is simpler, more reliable, and supports the `--source` local override for testing.
