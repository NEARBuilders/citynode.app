# Fix Plan: Init Repository Issues

5 root causes identified from `bun run dev` after a fresh `everything-dev init`.

---

## Fix 1 (CRITICAL): rspack resolves `every-plugin` to source .ts files

**File**: `packages/every-plugin/src/build/rspack/plugin.ts`
**Method**: `configureDefaults()`, after `resolve.extensions` line (~186)

**Problem**: When rspack runs in development mode (`rspack serve`), `getResolveDefaults()` sets:
- Top-level `conditionNames: ['webpack', 'development']`
- `byDependency.esm.conditionNames: ['import', 'module', 'webpack', 'development']` (after `'...'` expansion)

The `'development'` condition matches `every-plugin`'s exports that point to raw `.ts` source files. The swc-loader has `exclude: /node_modules/`, so these source files can't be compiled → parse failures on `export type`, `as const`, etc.

**Why it works in the monorepo**: Workspace symlinks resolve to `packages/every-plugin/src/*.ts`, which has a real path that does NOT match `exclude: /node_modules/`. So swc-loader compiles the source files successfully.

**Why it fails in init'd project**: npm-installed every-plugin is at `node_modules/.bun/every-plugin@2.2.5+.../node_modules/every-plugin/src/*.ts`, which DOES match `exclude: /node_modules/`. So swc-loader skips them → parse failures.

**Change**: Override `conditionNames` to exclude `"development"` from BOTH top-level and `byDependency`:

```typescript
// After resolve.extensions line
compiler.options.resolve.conditionNames = ["webpack", "import", "module", "require", "node", "default"];

if (compiler.options.resolve.byDependency) {
  for (const depType of Object.keys(compiler.options.resolve.byDependency)) {
    const depConfig = compiler.options.resolve.byDependency[depType as any];
    if (depConfig && typeof depConfig === "object" && "conditionNames" in depConfig) {
      const cn = (depConfig as { conditionNames: string[] }).conditionNames;
      if (Array.isArray(cn)) {
        (depConfig as { conditionNames: string[] }).conditionNames = cn.filter(
          (c) => c !== "development"
        );
      }
    }
  }
}
```

**Why the `byDependency` override is necessary**: rspack's `'...'` expansion happens during config normalization (the `A` function at line 6384 of the rspack source), BEFORE plugins run. By the time `EveryPluginDevServer.apply()` executes, `byDependency.esm.conditionNames` is already `['import', 'module', 'webpack', 'development']`. Overriding only the top-level `conditionNames` does NOT affect the already-expanded per-dependency conditions. The ESM resolver uses `byDependency.esm.conditionNames`, which still contains `'development'`. So we must also filter it from `byDependency`.

**Impact on monorepo**: every-plugin resolves to `./dist/index.mjs` instead of `./src/index.ts`. The dist files exist (built by tsdown). Plugin builds work, but hot reload for every-plugin source changes requires a tsdown rebuild. Acceptable since every-plugin rarely changes during plugin development.

---

## Fix 2 (HIGH): Missing UI assets, integrations, and phantom entries in `.templatekeep`

**File**: `.templatekeep`

**Problems**:
1. Missing `ui/src/assets/**` — imported by `under-construction.tsx` (gif) and `_layout.tsx` (png)
2. Missing `ui/src/integrations/tanstack-query/devtools.tsx` — imported by `__root.tsx`
3. Phantom entries that don't exist on disk:
   - `ui/src/components/error-boundary.tsx` (doesn't exist)
   - `ui/src/components/loading.tsx` (doesn't exist)
   - `ui/src/routes/accept-invitation/**` (directory doesn't exist)

**Changes**:

```diff
  ui/public/**
+ ui/src/assets/**
  ui/src/hydrate.tsx
```

```diff
+ ui/src/integrations/tanstack-query/devtools.tsx
  ui/src/providers/index.tsx
```

```diff
- ui/src/components/error-boundary.tsx
- ui/src/components/loading.tsx
  ui/src/components/theme-toggle.tsx
```

---

## Fix 3 (HIGH): Incorrect/incomplete route files in `.templatekeep`

**File**: `.templatekeep`

**Problems**:
1. `_layout/_admin.tsx` and `_layout/_admin/**` don't exist — real paths are `_layout/_authenticated/_admin.tsx` and `_layout/_authenticated/_admin/**`
2. `_authenticated.tsx` has NO children — the TanStack Router generator treats it as a leaf route and it conflicts with `_layout/index.tsx` at `fullPath: '/'` (see Fix 4)
3. Missing `about.tsx`, `opencode.tsx` (linked from sidebar and landing page)
4. Missing `apps/**` routes (linked from sidebar and landing page)

**Change**: Replace the routes section (lines 43-51):

```diff
- ui/src/routes/__root.tsx
- ui/src/routes/_layout.tsx
- ui/src/routes/_layout/_authenticated.tsx
- ui/src/routes/_layout/_admin.tsx
- ui/src/routes/_layout/_admin/**
- ui/src/routes/_layout/login.tsx
- ui/src/routes/_layout/index.tsx
- ui/src/routes/_layout/config.tsx
- ui/src/routes/accept-invitation/**
+ ui/src/routes/__root.tsx
+ ui/src/routes/_layout.tsx
+ ui/src/routes/_layout/index.tsx
+ ui/src/routes/_layout/about.tsx
+ ui/src/routes/_layout/config.tsx
+ ui/src/routes/_layout/login.tsx
+ ui/src/routes/_layout/opencode.tsx
+ ui/src/routes/_layout/_authenticated.tsx
+ ui/src/routes/_layout/_authenticated/home.tsx
+ ui/src/routes/_layout/_authenticated/settings.tsx
+ ui/src/routes/_layout/_authenticated/_admin.tsx
+ ui/src/routes/_layout/_authenticated/_admin/**
+ ui/src/routes/_layout/_authenticated/projects/**
+ ui/src/routes/_layout/_authenticated/organizations/**
+ ui/src/routes/_layout/_authenticated/keys/**
+ ui/src/routes/_layout/apps/**
```

---

## Fix 4 (RESOLVED BY FIX 3): TanStack Router route conflict

**Problem**: The error "Conflicting configuration paths were found for the following routes: /, /" occurs because both `_layout/index.tsx` and `_layout/_authenticated.tsx` resolve to `fullPath: '/'`.

**Root cause discovered**: The TanStack Router generator's `checkRouteFullPathUniqueness` function (line 415 of generator.js) is called with:

```js
sortedRouteNodes.filter((d) => d.children === void 0 && "lazy" !== d._fsRouteType)
```

This means it **only checks leaf routes** (nodes without children). When `_authenticated.tsx` has NO children (current .templatekeep), it's treated as a leaf route and conflicts with `_layout/index.tsx`. When it HAS children (the monorepo), it's a layout with children → excluded from the conflict check → no conflict.

**Fix**: Adding `_authenticated` children (Fix 3) makes `_authenticated.tsx` a proper layout route with children, so it's excluded from the conflict check. Only `_layout/index.tsx` remains as the leaf at `/`. No restructuring needed.

**Verified**: The monorepo has the exact same route structure and works because `_authenticated.tsx` has children (home, settings, keys, etc.) and is thus excluded from the uniqueness check.

---

## Fix 5 (MEDIUM): Missing `api-contract.gen.ts` stub for init'd project

**File**: `packages/everything-dev/src/cli/init.ts`

**Problem**: `personalizeConfig()` deletes the `sync:api-contract` and `postinstall` scripts from the init'd project's package.json. But `ui/src/api-contract.ts` imports from `ui/src/api-contract.gen.ts`:
```typescript
export type { ApiContract } from "./api-contract.gen";
```

Without the gen file, the UI build will fail with "Cannot find module './api-contract.gen'". The orchestrator generates this file during `bos dev` startup via `syncApiContractBridge()`, but until then it doesn't exist.

Additionally, `api-contract.gen.ts` is gitignored (`ui/src/*.gen.ts` in .gitignore), so it can't be included in `.templatekeep` (the `glob` function respects gitignore).

**Change**: Add a step in the init process to generate a minimal stub `api-contract.gen.ts`:

```typescript
// After copyFilteredFiles and personalizeConfig, write a stub:
const genContractPath = join(destination, "ui", "src", "api-contract.gen.ts");
if (!existsSync(genContractPath)) {
  writeFileSync(genContractPath, `export type ApiContract = Record<string, never>;\n`);
}
```

This provides a minimal type that allows the UI to compile. The orchestrator overwrites it with actual contract types on first `bos dev`.

---

## Fix 6 (LOW): MF version mismatch warning

**Problem**: `[Federation Runtime] Version ^3.21.0 from host does not satisfy the requirement of api which needs *`

Non-fatal warning from the `version-first` shareStrategy. Once plugins build successfully (Fix 1), they'll load despite this warning.

**Optional fix**: Change `shareStrategy` from `"version-first"` to `"loaded-first"`, or set explicit `requiredVersion` in shared deps config.

---

## Implementation Order

1. **Fix 1** (plugin.ts conditionNames + byDependency) — fixes ALL plugin build failures
2. **Fix 2** (.templatekeep assets, integrations, phantom removal)
3. **Fix 3** (.templatekeep routes — correct paths + add _authenticated children)
4. **Fix 4** is resolved by Fix 3 (no separate action needed)
5. **Fix 5** (init.ts stub for api-contract.gen.ts)
6. **Fix 6** is optional/low priority
7. Verify by running `everything-dev init` + `bun run dev` on a fresh directory

---

## Long-term Improvements (not blocking)

1. **Strip `development` conditions from every-plugin's npm package** during `stageReleasePackage()` in `manifest-normalizer.ts`. This prevents the condition from being available to npm consumers at all, complementing Fix 1's runtime override.

2. **Restructure routes** to be more robust against generator changes. Consider separating public and authenticated routes into distinct pathless layouts at the root level, sharing layout UI via a component.

3. **Consider not removing `sync:api-contract` and `postinstall` scripts** during init. Instead, rewrite them to use the installed `everything-dev` package paths.
