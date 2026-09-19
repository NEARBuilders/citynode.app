# ADR 0007: Platform bundle storage — file transport is an oRPC contract concern, not a host route

Date: 2026-09-19
Status: Accepted
Supersedes: the storage half of PR #58 (Cloudflare-R2-via-alchemy provider, closed as superseded)

## Context

Plan 029 (`advisor-plans/029-platform-cdn.md`) adds a `deploy.cdn: "platform"` provider so `bos publish --deploy` can upload Module Federation bundles to the platform API and tenants need no Zephyr/Cloudflare account. This forced a composition decision: where do binary upload/serve routes live, given the host mounts plugins only via oRPC (RPC + OpenAPI handlers)?

Three options were considered:

1. **`servicesTag` + raw host Hono routes** — the API plugin exposes a storage service via `servicesTag`; the host mounts bespoke `POST /api/storage/bundles` and `GET /bundles/*` routes delegating to it.
2. **oRPC contract routes** — the API plugin declares the routes in its oRPC contract; the host mounts the existing `OpenAPIHandler` once more.
3. **Hybrid** — oRPC for the authed JSON upload, raw host route for high-volume GET serving.

## Decision

**Option 2 — everything through the oRPC contract.** The API plugin owns two contract routes:

- `POST /storage/bundles` — `requireAuthOrApiKey`-family check (same session-for-API-key trust model as the relay path), path allowlist, traversal rejection, total-size ceiling, **SRI computed server-side over stored bytes**.
- `GET /bundles/{account}/{gateway}/{workspace}/{+path}` — public, returns a `File` (content-type carried by the file), `Cache-Control: public, max-age=31536000, immutable` via `ResponseHeadersHandlerPlugin`.

The host grows three generic lines, no storage-specific code:

- a route-scoped `bodyLimit` for `/api/storage/bundles` (registered before the global `/api/*` limit; sized from `BOS_MAX_BUNDLE_UPLOAD_BYTES`, default 64 MB decoded, 1.5× headroom for base64+JSON);
- a second mount of the same `OpenAPIHandler` at `/bundles/*` (`handleOrpc(c, apiHandler, "/", …)` — prefix-symmetric with the existing `/api` mount);
- in proxy mode, `/bundles/*` proxies to the API target like `/api/*`.

`servicesTag` remains reserved for **non-HTTP-shaped** host needs (auth bootstrap), matching its single existing consumer. In-process `pluginsClient` composition is unchanged.

Verified against the installed oRPC beta.35 (not just current docs): the runtime implements RFC 6570 `{+param}` catch-all path matching, and `File`/`ReadableStream` outputs serialize through both `RPCHandler` and `OpenAPIHandler`; `ZodToJsonSchemaConverter` converts `z.instanceof(File)` with `unrepresentable: "any"` so spec generation is safe.

## Consequences

- **The host stays fully generic** — no plugin-specific code grows on the host for storage, and future platform file services (plan 032 sandbox bundles, logs, snapshots) reuse the same pattern instead of each adding bespoke host routes + service tags.
- **One trust model.** Uploads authenticate exactly like the relay path. When the caller carries a NEAR principal (SIWN session), uploads are pinned to that account server-side; API-key uploads are bounded by the platform-wide ceilings, consistent with how `x-api-key` works across the API surface.
- **The key layout is the contract**: `bundles/<account>/<gateway>/<workspace>/<path>` — plan 032 stores tenant *config* in FastKV and *bundles* here; keep it stable.
- **R2 (or any object store) drops in behind `BundleStorage`** (`api/src/services/storage.ts`) without touching routes, host, or CLI. Platform-owned credentials only, never tenant-visible.
- **Follow-up generalization**: plan 033 (`advisor-plans/033-derived-openapi-mounts.md`) — derive extra HTTP mounts from contract metadata so the `/bundles` mount stops being hardcoded.
- **Trade-off accepted**: bundle assets appear in the OpenAPI/Scalar/MCP surfaces (read-only GETs, tagged `Storage`), and binary responses ride the oRPC serializer rather than a raw static handler — negligible at current scale.
