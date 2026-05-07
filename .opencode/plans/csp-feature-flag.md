# CSP Feature Flag Plan

## Goal
Add `CSP_STRICT` const to toggle between relaxed and strict CSP modes. Relaxed is the default, making near-connect wallet modals work without patching.

## Changes

### 1. `host/src/program.ts` — CSP mode const + conditional script-src

Add `const CSP_STRICT = false;` near the other server config (around line 403).

Replace the hardcoded `scriptSrc` with a conditional:

```ts
const cspScriptSrc = CSP_STRICT
  ? [NONCE, "'strict-dynamic'", "'unsafe-eval'"]
  : ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...uniqueOrigins];
```

Use `cspScriptSrc` in the `secureHeaders` config.

In `renderClientShell` (line ~502), make nonce conditional:
```ts
const nonce = CSP_STRICT ? ctx.get("secureHeadersNonce") : undefined;
```

In the HTML template, conditionally add nonce attributes:
```ts
const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
// ...
<script${nonceAttr} src="${clientUrl}/remoteEntry.js"${sriAttr}></script>
<script${nonceAttr}>${themeInitScript}</script>
<script${nonceAttr}>${hydrateScript}</script>
```

Also conditionally add `cspNonce` to runtime config:
```ts
const configWithNonce = nonce ? { ...runtimeConfig, cspNonce: nonce } : runtimeConfig;
```

In the SSR render path (line ~620):
```ts
const nonce = CSP_STRICT ? c.get("secureHeadersNonce") : undefined;
// ...
cspNonce: nonce,
```

### 2. `ui/src/lib/auth-client.ts` — Revert cspNonce addition

Remove `getCspNonce` import and `cspNonce: getCspNonce()` from siwnClient config. Not needed in relaxed mode.

### 3. `ui/src/app.ts` — Remove getCspNonce export

Remove `getCspNonce` from import and export lists.

### 4. `packages/everything-dev/src/ui/runtime.ts` — Keep getCspNonce

Leave `getCspNonce` function in place — it's still useful when CSP_STRICT is enabled.

### 5. `package.json` — Remove patch from postinstall

Change:
```
"postinstall": "bun packages/everything-dev/src/scripts/sync-api-contract.ts && bash scripts/patch-near-connect.sh"
```
To:
```
"postinstall": "bun packages/everything-dev/src/scripts/sync-api-contract.ts"
```

Keep `scripts/patch-near-connect.sh` file for future use when CSP_STRICT is enabled.

### 6. No changes needed for @fastnear/near-connect removal
It's not a direct dependency — it's a transitive ghost from some better-near-auth version's lockfile. No action needed in our package.json.

## Verification
1. `bun typecheck` passes
2. `bun run build` in packages/everything-dev succeeds
3. Dev server starts and wallet modal works without CSP errors
