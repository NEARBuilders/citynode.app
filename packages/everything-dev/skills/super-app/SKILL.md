---
name: super-app
description: Build shared-host, shared-API super apps with tenant-specific UI composition. Use when setting up a base runtime plus custom tenant apps, configuring fixed-core multi-tenancy, reasoning about extends-based runtime lineage, or deciding what tenants can override today.
metadata:
  sources: "host/src/services/tenant-runtime.ts,host/src/program.ts,host/src/services/federation.server.ts,packages/everything-dev/src/config.ts"
---

# Super Apps

Use this skill for the shared-host pattern where one runtime owns the host, auth, API, and base plugin set, while many descendant runtimes extend that runtime and swap UI-facing pieces per request.

## Mental Model

- `extends` is the lineage edge between runtimes.
- `account` is the tenant namespace root for the currently active runtime.
- `domain` is the public ingress for that runtime, not the lineage key.
- A runtime may be both a child in lineage and a tenant root operationally on its own domain.
- In fixed-core mode, the host, auth, API, and server-side plugins stay fixed to the active base runtime.
- Tenant-specific UI composition is applied per request.

Example mapping:
- `pingpay.io` -> base runtime `bos://pingpayio.near/pingpay.io`
- `pizza.com` -> runtime `bos://pizza.pingpayio.near/pizza.com` that extends `bos://pingpayio.near/pingpay.io`
- `chicago.pizza.com` should resolve inside the `pizza.pingpayio.near` namespace as `bos://chicago.pizza.pingpayio.near/pizza.com`

## What Works Today

Supported tenant overrides in fixed-core mode:
- `app.ui`
- existing `plugins.<id>.ui`
- existing `plugins.<id>.sidebar`

Still fixed to the base runtime:
- `app.host`
- `app.api`
- `app.auth`
- server-side plugin loading and router mounting

Not part of this mode:
- tenant-specific API overrides
- tenant-specific auth overrides
- introducing new plugin IDs dynamically per tenant
- full per-request host/plugin/auth/api hot swap

## Setup Flow

### 1. Create the base runtime

The base runtime owns the shared host and API surface:

```bash
bos init --overrides ui,api,host
```

This app is the one you deploy as the shared host.

### 2. Publish the base runtime

The base runtime must be published before tenants can extend it:

```bash
bos publish --deploy
```

### 3. Create a descendant runtime that extends the base runtime

Child runtime `bos.config.json`:

```json
{
  "extends": "bos://pingpayio.near/pingpay.io",
  "account": "pizza.pingpayio.near",
  "domain": "pizza.com",
  "repository": "https://github.com/example/pizza-app",
  "app": {
    "ui": {
      "name": "ui",
      "development": "local:ui",
      "production": "https://cdn.example.com/pizza-ui",
      "integrity": "sha384-..."
    }
  }
}
```

This runtime is still a lineage child because it extends the parent, but it is also its own tenant root when served from `pizza.com`.

You can also override existing plugin UIs and sidebar entries for tenant-specific navigation.

## Host Env For Tenant Mode

The shared host uses these env vars to resolve tenants:

```bash
ALLOW_OVERRIDE=ui,plugins.*
TENANT_WHITELIST=pizza.pingpayio.near,chicago.pizza.pingpayio.near
ALLOW_UNTRUSTED_SSR=false
```

Meaning:
- `ALLOW_OVERRIDE` controls which tenant config sections can affect request-scoped composition
- `TENANT_WHITELIST` controls which tenants may use SSR
- `ALLOW_UNTRUSTED_SSR=true` allows SSR for any valid tenant with SSR config

## Resolution Rules

Design target:
- bare domain serves the active runtime
- subdomains resolve within the active runtime account namespace
- nested labels should compose onto the active runtime account
- a runtime with its own account and domain becomes a new tenant root operationally, even when it extends another runtime

Current implementation limits:
- the shared host still resolves one tenant overlay on top of a process-wide base runtime
- fixed-core mode still only applies UI-facing overrides
- nested label resolution and account-relative tenant derivation are the desired model for future work, not the fully implemented resolver today

The tenant config must:
- exist in FastKV
- extend the base runtime
- resolve to the expected account for that active namespace
- provide integrity for overridden remote UIs

## Security Model

- Tenant UI overrides are integrity-checked before trust is established.
- Integrity verification uses bounded streaming, not full-response buffering.
- Asset requests use stale-while-revalidate verification to avoid latency spikes.
- HTML and SSR requests use blocking verification.
- SSR module cache identity includes `ssrIntegrity`, not just the SSR URL.

## Recommended Workflow

For the base runtime:

```bash
bos dev --host remote
bos publish --deploy
```

For a shared-host child UI app:

```bash
bos dev --host remote --api remote
bos publish --deploy
```

After publishing config changes that affect the base host runtime, restart the host process so it reloads the latest base config snapshot.

## When To Load Other Skills

- Use `everything-dev#init-upgrade` for scaffold/sync/upgrade mechanics.
- Use `everything-dev#extends-config` for deep-merge and resolved-config semantics.
- Use `everything-dev#publish-sync` for publish and deploy steps.
- Use this `super-app` skill when the question is specifically about the shared-host, shared-API multi-tenant architecture.
