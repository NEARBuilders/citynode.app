# Verification Roadmap: Closing the Gaps

The article claims "runtime apps that compose, verify, and evolve without rebuilding." Compose and evolve work. Verify is partially enforced. This document outlines what must be built to close the three critical gaps, in priority order.

## Current State

**Works:**
- Integrity hashes on `remoteEntry.js` — enforced at 4 points (throws on mismatch)
- Browser-side SRI — `integrity` + `crossorigin` attributes on `<script>` tags
- On-chain anchoring during publish — integrity written to FastKV on NEAR
- Security headers — 11 headers via Hono `secureHeaders`
- oRPC input/output validation — Zod schemas at runtime
- Admin-only on opencode — `requireAdmin` middleware

**Gaps:**
- Only `remoteEntry.js` verified, not dynamic chunks
- TOCTOU window between verify fetch and MF load
- No Content-Security-Policy header
- No runtime attestation against on-chain anchor
- No process isolation for plugins
- pluginsClient context spoofing (in-process calls bypass auth middleware)
- Secrets accessible via `process.env` from any plugin

---

## Priority 1: Content-Security-Policy + Chunk Integrity

**Why first:** This is the most likely attack vector. The Bybit hack was CDN compromise serving malicious JS. CSP is the primary browser defense against script injection. Chunk integrity closes the gap between entry verification and full content verification.

### 1a. CSP Header

**File:** `host/src/program.ts` (line 443)

Replace:
```typescript
app.use("*", secureHeaders({ crossOriginOpenerPolicy: "same-origin-allow-popups" }));
```

With:
```typescript
app.use("*", secureHeaders({
  crossOriginOpenerPolicy: "same-origin-allow-popups",
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'strict-dynamic'",
      "'unsafe-eval'",
      ...getTrustedOrigins(config),
    ],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", ...getTrustedConnectOrigins(config)],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: true,
  },
}));
```

Where `getTrustedOrigins(config)` extracts CDN URLs from the runtime config (UI URL, API URL, plugin URLs). `'strict-dynamic'` allows scripts loaded by trusted scripts to also execute — this is the CSP pattern that works with Module Federation.

**Key decisions:**
- `'unsafe-eval'` is likely required for Module Federation's runtime code generation. This weakens CSP but is currently unavoidable. Future MF versions may remove this requirement.
- `'strict-dynamic'` is the modern CSP approach: trust the initial scripts (listed by origin), and any scripts they dynamically load are also trusted. This covers the MF chunk loading pattern.
- Plugin CDN URLs must be enumerated in the CSP. When config changes, CSP must update. Since the host restarts on config change, this happens automatically.

### 1b. mf-manifest.json Chunk Integrity

**File:** `packages/everything-dev/src/integrity.ts`

Add a new function that verifies chunk integrity using the `mf-manifest.json`:

```typescript
export async function fetchManifestIntegrity(baseUrl: string): Promise<Map<string, string>> {
  const manifestUrl = baseUrl.endsWith("/mf-manifest.json")
    ? baseUrl
    : `${baseUrl.replace(/\/$/, "")}/mf-manifest.json`;
  
  const response = await fetch(manifestUrl);
  if (!response.ok) return new Map();
  
  const manifest = await response.json();
  const integrityMap = new Map<string, string>();
  
  // Module Federation 2.0 manifests include integrity hashes for all chunks
  if (manifest.integrity) {
    for (const [path, hash] of Object.entries(manifest.integrity)) {
      integrityMap.set(path, hash as string);
    }
  }
  
  return integrityMap;
}
```

**MF 2.0 manifests can include chunk-level integrity.** This is configured at build time in the rspack/rsbuild config. The host fetches the manifest, extracts chunk hashes, and can verify chunks before loading them.

**Alternative approach (simpler, less granular):** Use a custom Module Federation runtime plugin that hooks `createScript` to add SRI attributes for known chunks:

```typescript
// Custom MF runtime plugin for SRI on chunks
const sriPlugin = (): ModuleFederationRuntimePlugin => ({
  name: "sri-plugin",
  createScript({ url }) {
    const script = document.createElement("script");
    script.src = url;
    script.crossOrigin = "anonymous";
    const hash = chunkIntegrityMap.get(url);
    if (hash) script.integrity = hash;
    return script;
  },
});
```

**Build-side requirement:** The rspack config for each plugin must enable integrity hash generation. This is a `module-federation` config option or a custom plugin that computes hashes post-build and includes them in the manifest.

### 1c. Close the TOCTOU Window

**File:** `host/src/services/plugins.ts` (line 92-94)

Currently, integrity is verified via a separate fetch, then Module Federation loads the same URL again. Instead, verify the content that Module Federation actually evaluates:

**Option A:** Fetch the content once, verify, then serve to MF from a data URL or local cache:

```typescript
async function loadPluginEntryWithIntegrity(
  runtime: any,
  entry: RuntimePluginEntry,
  pluginsClient?: Record<string, unknown>,
): Promise<HostPluginEntry> {
  const url = entry.config.url;
  const integrity = entry.config.integrity;
  
  if (integrity) {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const computed = computeSriHash(buffer);
    if (computed !== integrity) {
      throw new Error(`[SRI] Integrity check failed for ${url}`);
    }
    // Store verified content for MF to load from cache
    verifiedContentCache.set(url, buffer);
  }
  
  // ... proceed with MF loading, which reads from cache
}
```

**Option B (simpler):** Add the integrity check directly into the Module Federation loading pipeline via a custom runtime plugin on the Node side, similar to the browser `createScript` hook but for `require`/`import`.

---

## Priority 2: pluginsClient Re-Authentication

**Why second:** This is the most critical architectural gap. A compromised API plugin can impersonate any user to any other plugin because in-process calls skip session verification.

### 2a. Authenticated pluginsClient Factory

**File:** `host/src/services/plugins.ts` (lines 181-198, 284-301)

Instead of passing raw `createClient` factories, wrap them with a factory that enforces session re-verification:

```typescript
function createAuthenticatedClientFactory(
  rawFactory: (context?: unknown) => any,
  authServices: AuthServices | null,
): (context?: unknown) => any {
  return (externalContext?: unknown) => {
    // If called from an external HTTP request, context comes from session middleware
    if (externalContext && typeof externalContext === "object" && "reqHeaders" in externalContext) {
      return rawFactory(externalContext);
    }
    
    // If called in-process (no real HTTP request), return a client that
    // re-verifies the session on each call
    return rawFactory; // No context = no user, safe default
  };
}
```

### 2b. Service-Level Auth Context

**File:** `packages/everything-dev/src/api.ts` / `host/src/services/plugins.ts`

The key insight: in-process calls should NOT carry user context. They should use a **service-level context** that is distinct from user-level context:

```typescript
type PluginContext = {
  userId?: string;
  user?: any;
  nearAccountId?: string;
  reqHeaders?: Record<string, string>;
  // Service-level context — only set for in-process calls
  serviceCall?: {
    fromPlugin: string;
    purpose: string;
  };
};
```

When the API plugin calls `services.plugins.registry()`, it gets a client with `serviceCall` context instead of `userId` context. Middleware that checks `context.userId` will reject service calls unless explicitly designed to allow them.

### 2c. Explicit Permission Model for In-Process Calls

Each plugin declares which of its routes are callable by other plugins in-process:

```typescript
// In contract.ts
export const contract = oc.router({
  listRegistryApps: oc.route({ method: 'GET', path: '/apps' })
    .output(AppListSchema)
    .metadata({ allowServiceCall: true }),  // Explicit opt-in
    
  relayRegistryMetadataWrite: oc.route({ method: 'POST', path: '/relay' })
    .input(RelayInputSchema)
    .output(RelayOutputSchema)
    .metadata({ allowServiceCall: false }),  // Default: no service calls
});
```

Routes that require authenticated user actions (relay, write operations) are not callable by other plugins in-process. Routes that are read-only or service-level (list, get, health) can opt in.

---

## Priority 3: On-Chain Attestation at Runtime

**Why third:** This closes the "trust the local config" gap. Currently, the host trusts its local `bos.config.json`. An attacker who modifies the local file (or intercepts the config fetch) can change integrity hashes to match malicious content.

### 3a. Fetch Config from On-Chain

**File:** `packages/everything-dev/src/config.ts`

Add an option to fetch `bos.config.json` from the FastKV registry on NEAR at startup, comparing it against the local file:

```typescript
async function verifyConfigAgainstChain(
  localConfig: RuntimeConfig,
  account: string,
  gatewayId: string,
): Promise<void> {
  const chainConfig = await fetchFromFastKV(account, gatewayId);
  if (!chainConfig) {
    console.warn("[Attestation] No on-chain config found, skipping attestation");
    return;
  }
  
  // Compare integrity hashes
  const localIntegrity = extractIntegrityHashes(localConfig);
  const chainIntegrity = extractIntegrityHashes(chainConfig);
  
  for (const [key, hash] of Object.entries(chainIntegrity)) {
    if (localIntegrity[key] && localIntegrity[key] !== hash) {
      throw new Error(
        `[Attestation] Integrity mismatch for ${key}: ` +
        `local=${localIntegrity[key]} chain=${hash}. ` +
        `Possible config tampering detected.`
      );
    }
  }
  
  console.log("[Attestation] Local config verified against on-chain anchor");
}
```

### 3b. Runtime Integrity Monitor

A background check that periodically re-verifies loaded remotes against on-chain anchors:

```typescript
// Every N minutes, re-verify that loaded remotes still match on-chain hashes
setInterval(async () => {
  const chainConfig = await fetchFromFastKV(account, gatewayId);
  if (!chainConfig) return;
  
  for (const [key, entry] of Object.entries(chainConfig.plugins ?? {})) {
    if (entry.integrity) {
      await verifySriForUrl(entry.url, entry.integrity);
    }
  }
}, INTEGRITY_CHECK_INTERVAL_MS);
```

### 3c. Signed Config

The strongest version: the `bos.config.json` published on-chain is signed by the publisher's NEAR account key. The host verifies the signature before trusting the config. This uses NEAR's Chain Signatures or function-call access keys to sign the config hash.

---

## Implementation Sequence

| Phase | Work | Files | Status |
|-------|------|-------|--------|
| **1a** | Add CSP header | `host/src/program.ts` | ✅ Done |
| **1b** | Enable chunk integrity in manifests | Build configs | ❌ Cancelled — requires MF build pipeline changes, diminishing returns vs TOCTOU fix |
| **1c** | Close TOCTOU window | `host/src/services/plugins.ts`, `packages/everything-dev/src/integrity.ts`, `packages/everything-dev/src/mf.ts` | ✅ Done — MF fetch lifecycle hook verifies content inside MF's own pipeline |
| **2a** | Safe pluginsClient factory | `host/src/services/plugins.ts` | ✅ Done — `createSafeClientFactory` strips all user context from in-process calls |
| **2b** | Service-level auth context | — | ❌ Rejected — empty-context factory is simpler and correct: read routes work naturally, write routes require real HTTP session |
| **2c** | Route-level service call permissions | — | ❌ Rejected — same reasoning as 2b |
| **3a** | On-chain config verification | `packages/everything-dev/src/integrity.ts`, `host/src/services/plugins.ts` | ✅ Done — `verifyConfigAgainstChain()` called at startup in production |
| **3b** | Runtime integrity monitor | `host/src/services/integrity-monitor.ts`, `host/src/program.ts` | ✅ Done — periodic background re-verification, started/stopped with server lifecycle |
| **3c** | Signed config | — | ❌ Cancelled — requires NEAR Chain Signatures integration, out of scope |
