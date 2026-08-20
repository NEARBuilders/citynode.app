## Question

For Tier 1 tenants with per-request web plugin URL overrides, how does `composeApp()` handle SSR route tree composition?

Key tension: TanStack Router requires the full route tree before `createRouter()`. But Tier 1 tenants may override specific web plugin URLs. If tenant A overrides `landing` to `tenant-a-landing` and tenant B overrides it to `tenant-b-landing`, each request to the shared host needs a different route tree.

Questions to resolve:
1. **Per-request router creation** — does the host create a new `Router` instance per request? What's the performance cost? SSR's `renderToStream` is the expensive part, not `createRouter()` — but we need to measure.
2. **Caching strategy** — can we cache composed route trees by tenant ID? When a tenant republishes (changes plugin URLs), invalidate the cache. Most requests hit the cache; only the first request after config change builds a new tree.
3. **MF remote loading** — if every request needs to potentially load a different set of MF remotes (because tenant overrides change URLs), do we need a shared MF runtime cache? Does `@module-federation/runtime` cache loaded remotes across requests?
4. **Route tree mutability** — `addChildren()` mutates the route's `children` array. If we reuse the same host route objects across requests, we can't just call `addChildren()` again — we'd need to clone or reset. Are route objects immutable enough to share?
5. **Effect.ts approach** — can tenant resolution be modeled as an `Effect`? `resolveTenantConfig(request) → Effect<ComposedRouteTree>` where `ComposedRouteTree` is built from cached base tree + tenant overrides?
6. **Alternative: single tree, runtime overrides** — instead of composing a new route tree per tenant, could the host use a single route tree where plugin routes check the tenant context and load different components? E.g., the `landing` route always exists but its `component` is determined by `useRouteContext().tenantConfig.web.landing.url`?

Key constraint from ticket #1: all remotes must load before `createRouter()`. If tenant-specific remotes need to load, we can't defer — they load upfront or not at all. This may constrain the number of distinct plugin overrides per shared host.

## Partial Resolution

**SSR-by-exclusion proven** by the [beta-v2 prototype](../../prototypes/beta-v2/) — session-gated mounts (`authenticated`, `admin`, `organization`) are `ssr: false`; the server renders nothing for those subtrees, so SSR never sees session-dependent content. Public and `anon` mounts SSR fully. Verified in `verify-ssr.tsx`.

**Still open**: per-request tenant-specific route tree composition (questions 1-6 above). The prototype proves the base case but not the multi-tenant SSR cache. The override prototype ([../../prototypes/beta-v2-override/](../../prototypes/beta-v2-override/)) proves `?config=` selection of base vs tenant trees in the browser, but does not test SSR for tenant-specific trees.
