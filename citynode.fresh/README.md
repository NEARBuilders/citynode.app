# Fresh

A minimal shared-host child runtime of [citynode.app](../README.md) that spawns new tenant
deployments: **scan a QR with your phone → sign in with a passkey → get a deterministic NEAR
account → spawn a tenant → code it locally.**

## What it does

1. **Pair** — the landing page shows an RFC 8628 device-link QR. The phone opens the link,
   authenticates with a passkey, and the desktop session is claimed. A direct sign-in link
   (passkey / NEAR wallet) is offered alongside.
2. **Link a NEAR account** — passkey sessions derive a deterministic `0s…` NEAR account
   (NEP-616, no seed phrase) via the auth plugin's `linkPasskeyWallet`; wallet sessions use the
   connected account directly.
3. **Spawn** — the console creates a user-owned tenant + primary binding on the base API
   (`POST /tenants/spawn`, PR #176). Hostnames under the gateway zone (`*.citynode.app`)
   auto-verify. Passkey-derived owners show a one-time **fund your account** step (a NEP-616
   `stateInit` creation) before publishing.
4. **Publish** — the tenant config is written to FastKV signed by the owner account as a
   NEP-366 delegate action through the gasless relayer. After that, the shared host serves the
   tenant at `<slug>.citynode.app`.
5. **Code it locally** — the success screen shows the two commands: `bos login` (pairs the CLI
   with the session, mints an API key) and `bos init --extends bos://<owner>/citynode.app`
   (scaffolds the spawned tenant locally).

## Shape

- `bos.config.json` extends `bos://v1.citynode.near/citynode.app` — this runtime owns **only
  its UI**; host, API, auth, and all plugins are inherited through the extends chain. Note the
  config intentionally declares **no `plugins` key** (plugin sections replace on merge).
- `ui/src/routes` declares exactly the mounts the inherited plugin UIs use (`_public`,
  `_authenticated`) and implements two routes: `/` (QR pair) and `/spawn` (spawn console).
- `ui/src/lib/spawn.ts` is the typed client surface for spawn/status/publish.
- While the framework npm dists lag main (Effect 4 sources), the root `package.json` overrides
  `every-plugin` / `everything-dev` / `better-near-auth` to `file:../packages/*`.

## Develop

```bash
bun install
bun run dev        # local ui + remote mainnet host/api/auth/plugins via the extends chain
```

## Deploy / publish

```bash
bos publish        # publish bos://fresh.v1.citynode.near/citynode.app to FastKV
```

The first dogfood publishes **without a ui override** — `fresh.citynode.app` serves the base
citynode ui through the tenant overlay; a `app.ui` override (production URL + SRI) comes once
the child's own bundle hosting is settled.
