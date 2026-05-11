# A New Renaissance: Why Software Must Compose or Collapse

The agents can build. They cannot inherit.

Every new project starts from zero. Every agent regenerates the same boilerplate — auth, routing, database, deployment — from scratch, badly, on every run. The boilerplate is not being maintained. It is being rewritten, infinitely, by tools that have no memory of what worked yesterday.

This is the structural problem under everything else.

## The Fall

Vibe coding was supposed to democratize software. The models are good enough. Cursor hit $100M ARR. Lovable generated over a million apps. The capability is real.

The substrate is not.

VibeWrench scanned 100 vibe-coded apps. The average security score was 62.7 out of 100. Lovable apps averaged 56.1 — 62% scored below failing. When a researcher audited 1,645 apps from Lovable's own showcase, 170 had critical flaws and 303 vulnerable endpoints. One EdTech app exposed 18,697 user records — including data from UC Berkeley and UC Davis — because the authentication logic was inverted. Logged-in users were blocked. Anonymous visitors were let through.

Veracode tested 150+ models across two years. **45% of AI-generated code fails security tests, and the rate is flat.** Even GPT-5 with extended reasoning only reaches 70-72%. SWE-Agent with Claude 4 Sonnet hits 61% functional correctness, but only 10.5% is functional *and* secure. The npm supply chain saw 1,241 confirmed malicious packages in 2025 — 15.3x more than 2024. Shai-Hulud, the first self-replicating npm worm, compromised 1,000+ packages and exposed 25,000 GitHub repositories.

None of this is a skill issue. It is a substrate issue.

When an agent builds an application from scratch, every dependency choice, every auth flow, every database call, every deploy script is being rediscovered. The agent is not composing from verified primitives. It is generating them. And the rate at which it generates them insecurely has been constant for two years across every frontier model.

The compute bottleneck is dissolving. The bottleneck that remains is trust — and trust does not come from a better model. It comes from a substrate where what the agent inherits is verifiable, typed, and known to work.

## The Framework Problem

Next.js is a good framework. It is the current state of the art for building production React applications. It also defines the ceiling.

React Server Components couple rendering to the deploy target. The bundle is the artifact. The manifest of what is running is opaque. Change one component and the entire application rebuilds and redeploys. Server Actions are implicit RPC — a client component can call server-side code with no explicit contract, no typed transport boundary, and no audit trail of what crossed the wire. The architecture works, but it works inside a single bundled monolith with a single deploy target.

This is not a critique of Next.js. Every build-time framework hits the same ceiling. The artifact is a sealed bundle. The composition is fixed at build time. The only way to inspect what is running is to read the source, build it yourself, and trust that the deployed bundle matches.

Module Federation breaks the seal. The UI is a remote. The API is a remote. Each plugin is a remote. They are built independently, deployed independently, and composed at runtime. The host loads them from URLs. The URLs come from a manifest.

every-plugin makes the boundaries typed. Each plugin declares its contract in oRPC — routes, inputs, outputs, errors — and the contract is the interface other plugins compose against. When the API plugin calls `services.plugins.auth().getSession()`, the call is in-process, type-checked end-to-end, and routed through the plugin's actual handler. No HTTP roundtrip. No untyped boundary. The API never knows whether `auth` is local code or a remote loaded from a CDN. The contract is the same.

`bos.config.json` is the manifest. It declares which remotes load, where they come from, and what variables and secrets they receive. The host reads it at startup. Change a URL — the next request loads from the new URL. Change a plugin — deploy only that plugin. The host never rebuilds.

This is the inversion. Where Next.js produces a bundle, everything.dev produces a composition. Where RSC composes at build time, every-plugin composes at runtime. Where Server Actions are implicit RPC across a sealed boundary, plugin contracts are explicit RPC across a federated boundary. The agent does not produce an artifact. It produces a compositional instruction — load this UI from here, this API from there, these plugins with these configurations — and the runtime assembles it.

**Composition is the artifact.**

## The Renaissance

The original Renaissance was not about individual genius. It was about composition from shared primitives. Painters composed from techniques that traveled through apprenticeship. Architects composed from structural patterns codified by Vitruvius. The Medici did not commission solitary masterpieces. They funded a compositional ecosystem where techniques, materials, and patterns flowed between workshops and across generations.

Our Renaissance follows the same pattern at a different layer. Adobe wrapped 50+ Creative Cloud tools into an MCP connector — Photoshop, Illustrator, Premiere, Firefly — all callable by an agent. The world's largest creative software company did not build a new AI product. It wrapped its existing tools into a composable surface and let agents compose from them.

TanStack shipped Intent: agent skills as npm package artifacts. Compositional knowledge that travels with code, versions together, auto-discovers from `node_modules`. 45.5K weekly downloads in eight weeks. The pattern is formalizing — knowledge composes the way code does.

What is missing is the substrate underneath. The original Renaissance had infrastructure: workshops with structured apprenticeship, guilds that verified provenance, standards for materials. Our digital Renaissance does not yet have an equivalent. Composable tooling at the application layer is meaningless if the application substrate is a sealed bundle with no provenance, no verification, no way to inherit.

That substrate is what everything.dev exists to be.

## Composable Software

A build-time bundle is a monolith. Change one component and the entire bundle rebuilds. The manifest of what is running is lost in the artifact. The provenance of what changed is opaque.

A runtime composition is a living system. Change one component and only that component redeploys. The manifest stays on-chain, inspectable by anyone. The provenance is verifiable through integrity hashes and on-chain records. The security is structural — every plugin has a typed contract, every remote has an integrity hash, every identity is cryptographic.

The primitives:

| Primitive | What it does |
|---|---|
| `bos.config.json` | Verifiable manifest — what runs, where it came from, integrity hashes |
| every-plugin | Typed contracts, composable APIs, runtime-loaded via Module Federation |
| Registry (FastKV) | On-chain discovery of published runtimes |
| `extends` / `bos://` | Compose by inheriting from published runtimes, not building from scratch |
| better-near-auth | Cryptographic identity via SIWN (NEP-413), gasless on-chain actions via relay (NEP-366) |
| TanStack Intent | Compositional knowledge versioned with code, auto-discovered by agents |
| Integrity hashes + SRI | Prove what is loaded matches what was published |

The architecture in motion: an agent discovers existing runtimes in the registry. It extends a published composition rather than building from scratch. It adds a plugin via every-plugin with a typed contract — no host rebuild required. It publishes the updated `bos.config.json` to NEAR, where the manifest is on-chain and verifiable. The host loads the new composition at runtime, with integrity hashes confirming what runs matches what was published.

This is the workshop model. The agent composes from verified, versioned, inspectable primitives. The compositional instruction is the artifact. The runtime verification is the guarantee. The boilerplate the agent would otherwise regenerate from scratch is instead inherited, typed, and known to work.

## NEAR as the Verification Layer

NEAR is not a blockchain you deploy to. It is a verification substrate that other projects compose against, layer by layer.

**Identity.** better-near-auth extends Better-Auth with SIWN — cryptographic sign-in where the user proves ownership of a NEAR account by signing a message with a key only they control. No passwords. No OAuth delegation. The gasless relay (NEP-366) then lets authenticated users interact with smart contracts without paying gas, creating an audit trail where every transaction's `predecessor_id` is the user's on-chain identity.

**Naming.** NameSky makes NEAR's named accounts tradeable, composable on-chain assets — identity that can be wrapped, transferred, and inherited. near-dns resolves standard DNS queries from on-chain smart contracts, making naming anti-fragile through a stateless gateway model where the blockchain is the source of truth.

**Hosting.** web4 puts entire web applications inside NEAR smart contracts — a WASM contract is the HTTP backend, the static assets, and the on-chain logic in one. The application is the contract. Links never rot. BOS stores composable frontend components on-chain in SocialDB, where any component can embed any other via `<Widget src="account.near/widget/Name" />`.

**Compute.** OutLayer provides TEE-attested off-chain computation with Intel TDX hardware guarantees — cryptographic proof that the code ran with the inputs claimed, verifiable by anyone, with no trust in the operator. wasm-git-apps treats Git as the data layer, with every user's data as a Git repository running in the browser via WebAssembly.

**Settlement.** NEAR Intents is an intent-based cross-chain settlement protocol with $15B+ cumulative volume across 35+ chains. Users express outcomes. Solvers compete. Settlement is atomic. The same compositional primitive, applied to economic flow.

**Composition.** everything.dev is the layer that unifies them. Published configuration defines how host, UI, API, and plugins load together. Not a framework that builds artifacts. A protocol that composes living systems.

The pattern is consistent at every layer: verification by default, composition as the primitive, open expression as the outcome. Named accounts are tradeable assets. DNS records are on-chain state. Applications are smart contracts. Frontends compose from each other. Computation proves itself. Settlement expresses intent. Identity is cryptographic. Software composes at runtime and verifies its integrity without rebuilding.

This only works on a chain where on-chain state is cheap, inspectable, and composable across contracts. NEAR is the only L1 designed around that property from the start — sharded state, named accounts, async cross-contract calls, storage staking that makes on-chain data economical rather than punitive. The verification layer is not a feature added on top. It is the architecture.

## Why Now

Runtime composition tooling hit stable. Rspack 2.0 and Rsbuild 2.0 shipped April 2026. Module Federation 2.0 went stable with decoupled runtime, dynamic types, and MCP integration. TanStack Intent formalized agent skill shipping in March.

Build-time security is measurably, persistently broken. 45% failure rate, flat for two years, across 150+ models. The creative economy is going agent-native — Adobe wrapped 50+ tools, Contra is ranking models for creatives, TanStack Intent is shipping compositional knowledge with code.

And NEAR's verification stack — SIWN, Intents, OutLayer, web4, everything.dev — shipped in the same window.

The Renaissance needs infrastructure. For the first time, the infrastructure exists.

## The Honest Frame

Could this fail? Yes. everything.dev competes with simpler frameworks — Next.js, Vite, plain Rspack — that are good enough for most use cases. Runtime security is genuinely hard: SRI is difficult with dynamic URLs, CSP conflicts with Module Federation, in-process plugin calls bypass session middleware until service-level auth ships. The roadmap to close these gaps is documented, but the gaps are real and worth naming.

The asymmetry holds anyway. The downside if the thesis fails is framework commodity pricing. The upside if it works is being the composition layer for agent-built software on the only substrate designed from the start to verify it.

In a world where 45% of agent-generated code fails security tests and the rate has not improved in two years, where the creative economy is going agent-native, where the bottleneck on AI is no longer compute but trust — the question is not whether something becomes the composition layer for agent-built software.

The question is which one. And whatever it is will be built on the chain that makes verification the default. That chain is NEAR. That is the argument.
