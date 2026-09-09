---
"ui": minor
"host": patch
"plugins/apps": patch
---

Rework the node lifecycle prototype at `/prototype-staking-poc` into a two-role (applicant / admin) clock with seven ordered stations: apply, deploy the tenant, endow the lockup, stake to the pool, register the team wallet as a delegate, delegate from the endowment, and vote as the team wallet. Each station declares its signer, so when the Trezu treasury changes between acts the row prompts you to connect before it can sign. DAO-signed actions are routed through the cycle as sputnik-dao proposals: you can stage calls ahead of time and collect votes on them later, or run what the currently connected wallet can sign in one click.

Tenant URLs across the dashboard, the public node page, the directory, the registry detail, and the prototype now build through a single dev-aware helper that resolves `<label>.localhost` against the host's binding resolver in development and `https://<label>.<gateway>` in production. The host's binding resolver now maps `<label>.localhost` onto the gateway alias when NODE_ENV is not production, so dev clicks on tenant links land on the right tenant instead of the base runtime. The server-side `buildOpenUrl` in the apps plugin refuses to fabricate a public URL for `*.localhost`/loopback hosts.
