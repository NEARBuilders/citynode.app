# Tenant Feature Completeness

## Problem

The DNS-based tenant routing in `host/src/services/tenant-runtime.ts` is well-architected
and the 8-step tenant creation wizard in the UI is polished. But the feature is incomplete:

- **No edit flow** — tenants are create-only. You cannot rename, change config, or delete from the UI.
- **Orphan risk** — multi-step creation (NEAR subaccount → org → DB → metadata → config publish) is
  not atomic. Subaccount and org can be created without a DB tenant record.
- **Inconsistent auth** — `listTenants` uses a manual `context.user` check instead of `requireAuth`
  middleware like the other tenant routes.
- **No soft-delete or status lifecycle** — deletion is permanent, no `updated_at`, no
  `active`/`suspended`/`pending_deletion` states.
- **`wikiAccountId` coupling** — the orgs page detects tenants via `org.metadata.wikiAccountId`,
  an implicit coupling between the creation flow and org metadata.
- **No status gating on the host** — a suspended tenant's site still serves normally.
- **Account ID fallback** — `subAccount.data?.accountId ?? `${subdomain}.${parentAccount}``
  assumes the format without verification.

## Goal

Full-featured tenant lifecycle: create, read, update, delete with proper auth, soft-delete,
status lifecycle, and clean org↔tenant detection.

## Architecture note

Single-level extends: tenant → base runtime. The base runtime IS the template (e.g. citynode.app).
No multi-environment resolution. No multi-template. No transitive extends.

---

## Phase 1: Schema & service hardening

**Files**: `api/src/db/schema.ts`, `api/src/db/migrations/`, `api/src/services/tenants.ts`

### Schema additions

```sql
ALTER TABLE tenants ADD COLUMN updated_at timestamp with timezone DEFAULT now();
ALTER TABLE tenants ADD COLUMN status text NOT NULL DEFAULT 'active';
  -- 'active' | 'suspended' | 'pending_deletion'
ALTER TABLE tenants ADD COLUMN deleted_at timestamp with timezone;
```

Add a `status` enum type and `updated_at`/`deleted_at` columns. The `deleted_at` column
enables soft-delete (retain records for 30 days, then purge via a background job).

### Service additions

| Method | Description |
|--------|-------------|
| `updateTenant(id, input)` | Update name, subdomain (with re-validation). Check uniqueness before writing. |
| `softDeleteTenant(id)` | Set `status = 'pending_deletion'`, `deleted_at = now()`. Actual deletion happens after a grace period via a periodic job. |
| `suspendTenant(id)` | Set `status = 'suspended'` — the host's `resolveRequestRuntime()` checks this and returns 503. |
| `reactivateTenant(id)` | Set `status = 'active'`. |
| `resolveTenantBySubdomain(subdomain)` | Lookup by subdomain (for uniqueness checks without accountId). |

### Auth consistency

In `api/src/index.ts`, apply `requireAuth` middleware to `listTenants` — remove the manual
`context.user` check. The org-scoped filter already limits results to the user's orgs.

```typescript
builder.listTenants
  .use(requireAuth)   // was: manual context.user check
  .handler(async ({ context }) => {
    return context.tenants.listTenantsByOrgIds(
      context.organizations?.map((o) => o.id) ?? []
    );
  });
```

### Atomic creation

Wrap the DB insert in a service method that validates subdomain/accountId uniqueness
with a proper error before hitting `onConflictDoNothing`. No DB schema change needed
here — the existing unique constraints on `subdomain`, `account_id`, and `org_id` already
protect against duplicates.

The non-atomicity problem is in the UI's 8-step wizard (NEAR subaccount → org → DB).
This cannot be fully solved at the API layer because NEAR subaccount creation is
on-chain and Better-Auth org creation is a separate service. Mitigations:

1. **Before starting the flow**, call a preflight check: `POST /tenants/preflight` that
   validates NEAR account availability and subdomain uniqueness.
2. **Cleanup on failure**: after the DB insert succeeds, the UI considers the tenant
   created. If metadata/config publish fail, they are non-blocking (already the case).
   If the DB insert fails after subaccount+org are created, show a manual cleanup
   instruction ("contact support") — there is no two-phase commit across a blockchain,
   a database, and Better-Auth.

---

## Phase 2: API contract updates

**File**: `api/src/contract.ts`

New routes:

| Route | Method | Path | Auth | Description |
|-------|--------|------|------|-------------|
| `updateTenant` | PATCH | `/tenants/{tenantId}` | `requireAuth` + `requireOrgRole("owner")` | Update name, subdomain |
| `deleteTenant` | PATCH (was DELETE) | `/tenants/{tenantId}` | `requireAuth` + `requireOrgRole("owner")` | Soft-delete (sets status) |
| `suspendTenant` | POST | `/tenants/{tenantId}/suspend` | `requireAuth` + `requireOrgRole("admin")` | Suspend |
| `reactivateTenant` | POST | `/tenants/{tenantId}/reactivate` | `requireAuth` + `requireOrgRole("admin")` | Reactivate |
| `tenantPreflight` | POST | `/tenants/preflight` | `requireAuth` | Validate subdomain + accountId availability |

Update `TenantSchema` to include `status`, `updatedAt`, `deletedAt`.

Change `deleteTenant` from `DELETE` to `PATCH` (soft-delete is a status change, not a
record removal). The old `DELETE` route can remain for a migration period or be removed
since this is a pre-release feature.

---

## Phase 3: UI tenant management

**Files**: `ui/src/routes/_layout/_authenticated/tenant/`

### New routes

```
tenant/
  new.tsx          (existing — creation wizard)
  $tenantId/
    index.tsx      (tenant detail/edit page)
    settings.tsx   (config editor, subdomain management)
```

### Tenant detail/edit page (`$tenantId/index.tsx`)

- Shows tenant info (name, subdomain, accountId, status, org, created/updated dates)
- Edit name and subdomain inline with save button
- Status badge with actions: suspend / reactivate
- "Delete tenant" section at the bottom (with confirmation dialog)
- Links to org management

### Post-creation improvement

After the creation wizard completes in `tenant/new.tsx`, add a "view tenant" link that
navigates to the new detail page.

### Remove `wikiAccountId` coupling

In `organizations/index.tsx`, instead of checking `org.metadata?.wikiAccountId`, call
`apiClient.resolveTenant({ accountId })` for each org's linked account. Cache the result
in a TanStack Query to avoid N+1 problems. Alternatively, add a `listTenantsByOrgIds`
bulk endpoint that the page can call once.

---

## Phase 4: Multi-environment tenant resolution

Removed — multi-environment resolution is out of scope. The host always fetches tenant configs
for `"production"`.

---

## Phase 5: Transitive extends validation

Removed — single-level tenancy (tenant → base) only. Not needed.

---

## Phase 6: Host status gating via published config

**Files**: `host/src/services/tenant-runtime.ts`, `packages/everything-dev/src/types.ts`,
`host/tests/integration/tenant-runtime.test.ts`

### Problem

The host does not check tenant status during `resolveRequestRuntime()`. A suspended tenant's site
still serves normally.

### Solution

Status travels in the tenant's published `bos.config.json` on FastKV — the host already loads this
config at resolution time. No extra API call or database, which avoids a circular dependency
between host and API.

1. Add an optional `status` field (`active` | `suspended` | `pending_deletion`) to
   `BosConfigInputSchema` / `BosConfigInput` in `packages/everything-dev/src/types.ts` so it
   survives config parsing.
2. In `resolveRequestRuntime()`, read `status` from the raw config and reject non-active tenants:

```typescript
const tenantStatus = getTenantStatus(remoteConfig);
if (tenantStatus === "suspended") {
  throw new TenantRuntimeError("Tenant is suspended", 503);
}
if (tenantStatus === "pending_deletion") {
  throw new TenantRuntimeError("Tenant has been deleted", 410);
}
```

3. The API's suspend/reactivate/delete handlers update the DB `status` column (source of truth),
   and the UI republishes the tenant's config with the matching `status` so the host sees it within
   the 30s remote-config cache TTL.
4. The DB record is canonical; the published config carries a denormalized copy for the host, which
   cannot query the API at request time.

### Test coverage

- `rawConfig.status: "suspended"` → rejects with 503
- `rawConfig.status: "pending_deletion"` → rejects with 410
- No `status` field → resolves normally (defaults to `active`)

---

## File change summary

| File | Change | Phase |
|------|--------|-------|
| `api/src/db/schema.ts` | Add `updated_at`, `status`, `deleted_at` columns + `tenant_status` enum | 1 |
| `api/src/db/migrations/` | New migration SQL | 1 |
| `api/src/services/tenants.ts` | Add `updateTenant`, `softDeleteTenant`, `suspendTenant`, `reactivateTenant`, `resolveTenantBySubdomain`, `resolveTenantByOrgId` | 1 |
| `api/src/index.ts` | Fix `listTenants` auth, wire all new handlers + preflight | 1, 2 |
| `api/src/contract.ts` | New/updated routes + updated `TenantSchema` + preflight | 2 |
| `ui/src/routes/_layout/_authenticated/tenant/$tenantId.tsx` | Tenant detail/edit/suspend/delete page with config republish | 4 |
| `ui/src/routes/_layout/_authenticated/tenant/new.tsx` | Fix `accountId`, remove `wikiAccountId` metadata, post-creation nav | 3, 4 |
| `ui/src/routes/_layout/_authenticated/organizations/index.tsx` | Replace `wikiAccountId` with `resolveTenantByOrgId` | 4 |
| `packages/everything-dev/src/types.ts` | Add `status` to `BosConfigInputSchema` / `BosConfigInput` | 6 |
| `host/src/services/tenant-runtime.ts` | Status gating from published config | 6 |
| `host/tests/integration/tenant-runtime.test.ts` | Tests for suspended / pending_deletion status | 6 |

## Dependencies

- `bos types gen` regenerates `api`/`ui`/`host` plugin types after contract changes.
- Status gating (Phase 6) rides the existing 30s remote-config cache TTL, so no host restart or
  hot-swap is strictly required — the status change is picked up when the config cache expires.
