# Sandbox orchestrator + gateway — spike design

Plan: `advisor-plans/032-sandbox-orchestrator-spike.md` (spike only, `BOS_SANDBOX=1` gated)
Status: spike in progress — branch `spike/sandbox-orchestrator`
Author context: locked operator decisions of 2026-09-18 + ADR 0011 (image-native artifacts)

## Amendment to plan 032 (operator-approved, 2026-09-26)

Plan 032's drift check required `ResourceProvisioner` (plan 031) to exist.
Plan 031 was never executed, which trips the plan's own STOP condition. The
operator chose the **reduced spike**: the provisioner seam is substituted by
spike-local env injection for the local docker machine provider, while the
lease/machine model keeps 031's binding shape
(`{ secretName, url }` via `bindingEnv`) so plan 031 can slot in later
without rework. The *storage* half of the 031 dependency dissolved under
ADR 0011: a sandbox host stages and serves its own bundle namespace
same-origin — no platform storage credentials exist to inject.

Sandbox DB (operator decision): a throwaway docker Postgres container per
sandbox host (closest analog to the production Neon-branch sandbox stage),
isolated from dev `api_db`.

## Lease model

`SandboxOrchestrator` is a `Context.Service` in `everything-dev/sandbox`
(`src/sandbox/orchestrator.ts`):

- `acquireLease(tenant: { account, gateway }) -> SandboxLease` — an
  `Effect.acquireRelease` resource. The release finalizer stops the
  machine(s). While the CLI process lives, an idle-TTL sweeper stops the
  lease when `lastUsedAt` ages past `ttlMs`; an explicit `stop()` (or
  process exit) releases deterministically.
- Replacement on republish (crash/replace): container names are
  deterministic (`sandbox-pg-<account>-<gateway>`,
  `sandbox-host-<account>-<gateway>`); an existing container with the same
  name is removed before spawn, so a re-run is an idempotent replace.
- Lease state persists to `.bos/sandboxes.json` (same file the host's
  BindingResolver overlays when `BOS_SANDBOX=1`) — the handoff record
  between the orchestrator process and the gateway.

## Machine model (spike provider: local docker)

Per lease, two containers:

1. **Throwaway Postgres** — `postgres:17-alpine`, random free host port,
   creds `sandbox/sandbox` db `sandbox`. Its URL rides the env handoff as
   `DATABASE_URL` (the `bindingEnv` shape 031 will formalize; plugins get
   schema isolation via `plugin_<pluginId>` search_path as usual, and the
   stack auto-migrates on boot).
2. **Platform image container** — the committed root `Dockerfile` image
   (digest recorded in the lease), running `bos start` with **env only**:
   `BOS_ACCOUNT` (tenant account), `BOS_GATEWAY` (tenant gateway), a
   per-sandbox random `BETTER_AUTH_SECRET`, `DATABASE_URL`, `PORT`,
   `BOS_BUNDLE_DIR`. **No platform storage credentials** — ADR 0011 makes
   this structurally true (the image serves its own staged dists).

Health gate = the existing `/health` (`status: "ready"`), polled with
bounded retries. Spike additionally supports `--config-path` boot
(mounted scratch tenant config) so the local e2e can run without a
FastKV publish; production uses the FastKV publish path (`bos publish`).

Machine provider is an interface (`SandboxMachineProvider`) so unit tests
run against a fake; the docker implementation is the only spike provider
(alchemy machines vs railway API remains an open production decision).

## Gateway

- `TenantBinding` gains optional `hostMode: "shared" | "sandbox"` and
  `sandboxUrl`. Production source of truth (post-spike): the tenant's
  `stage` + binding columns served by `GET /tenants/bindings`. Spike
  source: the lease file (`.bos/sandboxes.json`) overlay applied by the
  host's BindingResolver **only when `BOS_SANDBOX=1`** — no DB schema
  changes in the spike.
- New middleware `host/src/middleware/sandbox-proxy.ts`: when the flag is
  on and the request hostname resolves to a sandbox binding, the **whole
  request** (SSR pages, static assets, `/api/*`, `/bundles/*`) proxies
  wholesale to `sandboxUrl` via the existing `proxyRequest` helper.
  Registered in `program.ts` right after the security middlewares —
  before static-asset/API/SSR handlers. Base-host requests and
  shared-host tenant bindings pass through untouched.
- Extends-chain + integrity verification runs identically inside the
  sandbox host (it is a full `bos start` boot); the spike adds no
  verification bypasses.

## Measured findings (fill in from the e2e)

- cold start (container start → `/health` ready): **not yet measured — e2e
  blocked** (see below)
- idle teardown behavior + re-acquisition cold start: TBD
- in-flight request drain on teardown (ticket 10): TBD
- failure modes hit:
  - **Known issue (e2e blocker)**: the first live `bos sandbox start
    --account sandbox-demo.near --gateway citynode.app --shared-network …
    --detach` hung past 300s *after* the throwaway Postgres container was
    up and mapped (port 54283) but *before* tenant boot-config generation
    (no `mkdtemp` dir), host-container spawn, and lease-file write. No
    error/cleanup ran (onError did not fire — the fiber stalled, it did
    not fail). Probes: `docker run` of the platform image with the same
    shape is instant (0.7s); every provider exec is bounded at 30s; the
    unit suite proves the health-retry loop terminates on failure. The
    stall is therefore inside the orchestrator fiber between the pg spawn
    resume and config generation — next step is an instrumented
    step-by-step repro (timestamps around findFreePort/ensureNetwork/
    spawn/buildTenantBootConfig) before trusting the lease model on the
    docker provider. The fake-provider unit tests all pass, so the lease
    semantics themselves are covered; this isolates the defect to the
    docker exec/Effect boundary.

## Out of scope (unchanged)

Billing/quotas, multi-region, per-sandbox observability, DNS automation
(spike uses `<slug>.localhost`; production DNS path is tenants.md custom
domains), machine provider choice, ticket-10 resolution (measured, not
solved).

## Runbook

```sh
docker build -t citynode-platform:spike .          # platform image (digest recorded)
BOS_SANDBOX=1 bos sandbox start --account <tenant>.near --gateway citynode.app
# → spawns pg + host containers, waits for /health, writes .bos/sandboxes.json
# → tenant renders at http://<slug>.localhost:<hostPort> via the shared host's proxy
BOS_SANDBOX=1 bos sandbox list
BOS_SANDBOX=1 bos sandbox stop --account <tenant>.near --gateway citynode.app
```

Flag-off invariant: without `BOS_SANDBOX=1`, `bos dev`/`bos start`, the
BindingResolver, and every middleware behave byte-identically to main
(golden tests).
