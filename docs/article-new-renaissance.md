# A New Renaissance: Why Software Must Compose or Collapse

Rome didn't fall in a day. The aqueducts were poisoned slowly. The roads grew dangerous. The institutions that held everything together — provenance, verification, trust — eroded until the whole system collapsed under its own weight.

Software is at that moment now. The old world — build-time bundles, trust-the-CDN, trust-the-pipeline — is not declining. It collapsed. What comes next determines whether we rebuild on the same foundation or construct something that holds.

## The Fall

The vibe coding revolution was supposed to democratize software. Anyone can build an app now. The models are good enough. Claude Code, Cursor, Bolt, Lovable, Devin — they ship real software. Cursor hit $100M ARR. Lovable generated over a million apps. The capability is real.

The safety is not.

VibeWrench scanned 100 vibe-coded apps across Lovable, Bolt, Cursor, and v0. The average security score was 62.7 out of 100. 89 critical findings across the set. Lovable apps averaged 56.1 — 62% scored below failing. When security researcher Matt Palmer audited 1,645 Lovable apps from the official showcase, 170 had critical flaws with 303 vulnerable endpoints. One Lovable-built EdTech app exposed 18,697 user records including student data from UC Berkeley and UC Davis because the authentication logic was inverted — it blocked logged-in users and let anonymous visitors through.

Moltbook, a vibe-coded social network, breached within three days of launch. 1.5 million API tokens exposed. The founder stated he had not written a single line of code.

This isn't a skill issue. It's structural. Veracode tested 150+ LLMs across two years. **45% of AI-generated code fails security tests.** This rate has been flat since 2023 despite enormous model advances. Even GPT-5 with extended reasoning only reaches 70-72% — one in three outputs still has a vulnerability. SWE-Agent with Claude 4 Sonnet achieves 61% functional correctness, but only **10.5% is both functional and secure.**

35 CVEs were attributed to AI-generated code in March 2026 alone, up from 6 in January. Georgia Tech estimates the real number is 5-10x higher.

The problem compounds outward. The JavaScript supply chain is under industrial-scale attack. 1,241 confirmed malicious npm packages appeared in 2025 — a 15.3x increase from 2024. Shai-Hulud, the first self-replicating npm worm, compromised 1,000+ packages and exposed 25,000 GitHub repositories. The S1ngularity attack on Nx affected 370 companies in under 8 hours. Attackers phished the maintainer of `chalk` and `debug` — packages with 2+ billion weekly downloads.

And the Bybit hack proved that runtime-loaded JavaScript is a catastrophic attack surface. $1.46 billion was stolen not by breaking cryptography, not by compromising a smart contract, but by **modifying JavaScript on a CDN**. Attackers injected malicious code into Safe{Wallet}'s S3 bucket. The code was targeted — it only activated for Bybit's specific cold wallet address. Three authorized signers approved what appeared to be a legitimate transaction. The UI lied. The signatures were real. Two minutes after the exploit, the attackers restored the original files to cover their tracks. No file integrity monitoring detected the change.

SRI — the only browser-level defense against tampered third-party scripts — is barely used. 25.9% of pages use SRI at all, but the median page protects only 2.8% of its scripts. This number has been flat for four years. And Module Federation, the dominant architecture for runtime composition, **cannot use SRI for dynamically resolved URLs** because the hash is unknown until the remote is built.

The agents themselves are now attack vectors. Clinejection: a prompt injection on Cline's GitHub Issues triage bot — 5 million users — led to stolen publishing credentials and a malicious `cline@2.3.0` package live for 8 hours with 4,000 downloads. "Comment and Control": a single prompt injection pattern compromised Anthropic, Google, and Microsoft agents simultaneously, using GitHub itself as the command-and-control channel. RoguePilot: a malicious GitHub issue took over Copilot + Codespaces for full repository takeover.

The structural argument is this: when an AI agent builds an application that loads code at runtime from URLs, every vulnerability compounds. The AI writes insecure code (45% failure rate, flat for two years). The runtime-loaded code cannot be verified (2.8% SRI coverage). The supply chain is under industrial attack (15.3x increase in malicious packages). And the agent itself can be prompt-injected into deploying malicious updates.

Build-time software has no compositional integrity. You cannot inspect what is running. You cannot prove what the agent built is what is actually deployed. You cannot swap a component without redeploying the whole application. You cannot verify provenance. The aqueducts are poisoned, the roads are full of bandits, and the legions are compromised.

## The Renaissance

Something is being born in the wreckage.

Adobe shipped "Adobe for creativity" — 50+ Creative Cloud tools wrapped as an MCP connector for Claude. Photoshop, Lightroom, Illustrator, Premiere, Firefly — the entire professional creative stack, callable by an agent. "You direct. The assistant executes." The world's largest creative software company did not build a new AI product. It wrapped its existing tools into a composable surface and let the agent compose from them.

Contra Labs launched AI model testing and ranking by creatives. A commission-free network where independents discover, compare, and create with AI tools. The iconography is deliberate: Renaissance art fused with digital UI. A classical woman at a dithered keyboard. Digital renaissance.

BUILD.org partnered with Adobe to bring "Basics of Branding with Adobe Express" into under-resourced classrooms. Students with no prior design experience compose professional creative output — logos, ads, social graphics — from tooling that reduces the skill barrier while the composition produces the result.

TanStack shipped Intent — agent skills as npm package artifacts. Compositional knowledge that travels with code, versions together, auto-discovers from `node_modules`. 45.5K weekly downloads in eight weeks. Electric SQL already ships skills with `@tanstack/db`. The pattern is formalizing: **knowledge should compose the same way code does.**

These are not isolated products. They are the same pattern at different scales: the human provides the vision, and compositional tooling produces the execution. The quality of the output depends on the quality of the primitives available to compose from.

The original Renaissance was not about individual genius. It was about composition from shared primitives — perspective, pigment recipes, the workshop system. Painters composed from techniques that traveled through apprenticeship. Architects composed from structural patterns codified by Vitruvius. The Medici did not commission solitary masterpieces; they funded a compositional ecosystem where techniques, materials, and patterns flowed between workshops and across generations.

Our Renaissance is following the same pattern. But the original Renaissance had something our digital one does not yet have: infrastructure. Workshops with structured apprenticeship. Guilds that verified provenance. Patronage networks that funded composition. Standards for materials and techniques that made composition safe. The digital Renaissance needs the same — compositional infrastructure that is verified, typed, and safe to compose from.

## Claude Mythos

The agents have arrived, and they are mythological.

Claude. Copilot. Devin. Bolt. They are not tools in the way that a text editor is a tool. They are demigods — powerful, prolific, and structurally untrustworthy. They can write a full application in minutes. They can also leave the kingdom vulnerable while the hero rides home.

The data is unambiguous. 10.5% of agent-built code is both functional and secure. "Comment and Control" demonstrated that a single prompt injection compromises Anthropic, Google, and Microsoft agents simultaneously — three of the most sophisticated AI companies on earth, breached through the same architectural flaw. The Lovable platform itself had a BOLA vulnerability that let anyone access another user's database credentials in five API calls. The tool that builds the city had a secret door.

Nine CVEs have been filed against Cursor. Five involve prompt injection as the entry point. The structural problem is stated plainly: an AI agent reads untrusted input and can execute commands. Those two things together will keep producing CVEs.

Illia Polosukhin, NEAR co-author and co-author of the Transformer paper that started modern AI, puts it directly: **"Security is the biggest bottleneck."** Not compute. Not capability. Trust.

This is the shift. The compute bottleneck defined the first wave of AI — more GPUs, more parameters, more tokens. That bottleneck is dissolving. What replaces it is trust: can you trust the agent with secrets? Can you trust what it built is what's running? Can you trust the composition hasn't been tampered with? Can you trust the provenance of every component?

The answer, today, is no. Not because the agents are bad, but because the infrastructure they build on has no trust layer. Traditional CI security — runner isolation, secret scoping, branch protection — collapses when an AI agent in the loop can read attacker-controlled text and act on it with the credentials it holds. SRI, the browser's integrity mechanism, covers 2.8% of scripts. Build-time bundles provide no runtime verification. The npm supply chain is under automated, industrial-scale attack.

The agents are powerful enough to build a new civilization. They are not trustworthy enough to secure it. They need a substrate where what they build is verifiable — where composition has provenance, runtime has integrity, and identity is cryptographic.

## Composable Software

A build-time bundle is a monolith. When an agent changes one component, the entire bundle must be rebuilt and redeployed. The manifest of what is running is lost in the artifact. The provenance of what changed is opaque. The security of what is loaded is unverified.

A runtime composition is a living system. When an agent changes one component, only that component is redeployed. The manifest stays on-chain, inspectable by anyone. The provenance is verifiable — integrity hashes, on-chain records, typed contracts. The security is structural — every plugin has a typed contract, every remote has an integrity hash, every identity is cryptographic.

This is the distinction that matters: **composition, not bundling.** The agent does not produce a deployable artifact. It produces a compositional instruction — "load this UI from here, this API from there, these plugins with these configurations" — and the runtime assembles it verifiably.

everything.dev implements this as a composition protocol. The primitives:

| Primitive | What it does |
|---|---|
| `bos.config.json` | Verifiable manifest — what runs, where it came from, integrity hashes |
| every-plugin | Typed contract + composable API + runtime-loaded via Module Federation |
| Registry (FastKV) | On-chain discovery — what runtimes exist and can be composed |
| `extends` / `bos://` | Compose by inheriting from published runtimes, not building from scratch |
| better-near-auth | Cryptographic identity via SIWN (NEP-413) + verifiable on-chain actions via gasless relay (NEP-366) |
| TanStack Intent skills | Compositional knowledge versioned with code, auto-discovered by agents |
| SRI + integrity hashes | Prove what is loaded matches what was published |

**Runtime apps that compose, verify, and evolve without rebuilding.**

The architecture in motion: an agent discovers runtimes in the registry, extends an existing composition rather than building from scratch, adds a plugin via every-plugin with a typed contract that requires no host rebuild, publishes the updated `bos.config.json` to NEAR where it is on-chain and verifiable, and the host loads the new composition at runtime with integrity hashes confirming what runs matches what was published.

This is the workshop model from the Renaissance. The agent composes from verified, versioned, inspectable primitives — not from scratch, not from a bundle, not from unverified CDN JavaScript. The compositional instruction is the artifact. The runtime verification is the guarantee.

**The honest state of enforcement.** The architecture above is real and the integrity checks on `remoteEntry.js` are enforced — the host throws on hash mismatch at four verification points, and browser-side SRI attributes block tampered scripts. But the current enforcement is a perimeter defense: it verifies the front door while leaving windows open. Dynamic chunks loaded by Module Federation after the entry script are not individually verified. No Content-Security-Policy header restricts which origins can execute scripts. In-process plugin calls bypass session middleware, meaning a compromised plugin could impersonate a user to other plugins. Integrity hashes are anchored on-chain during publish, but the host does not re-verify its local config against the on-chain anchor at runtime. These gaps are not theoretical — the Bybit attack proved that compromising a CDN to serve tampered JavaScript works, and the Clinejection attack proved that agents can be turned into supply chain attack vectors. The roadmap to close these gaps is documented: CSP headers, chunk-level integrity via `mf-manifest.json`, service-level authentication for in-process plugin calls, and on-chain attestation at runtime. The architecture is right. The enforcement is incomplete. Acknowledging the gap is stronger than pretending it's closed.

## The NEAR Ecosystem as a Renaissance City-State

The projects in the NEAR ecosystem are not unrelated efforts. They are the infrastructure of a new civilization, each building on the layer below:

**Identity and naming.** NameSky makes NEAR's human-readable named accounts tradeable, composable on-chain assets — identity that can be wrapped, transferred, and composed. near-dns resolves standard DNS queries from on-chain smart contracts, making naming verifiable and anti-fragile through a stateless gateway model where the blockchain is the source of truth.

**Hosting and frontends.** web4 hosts entire web applications inside NEAR smart contracts — a WASM contract is the HTTP backend, static resources, and blockchain logic in one. The application is the contract. Links never rot. BOS stores composable frontend components on-chain in SocialDB, where any component can embed any other via `<Widget src="account.near/widget/Name" />`. 1,800+ components at launch proved composition at scale works.

**Data and compute.** wasm-git-apps uses Git as the data layer — every user's data is a Git repository running in the browser via WebAssembly, giving versioning, offline-first, and portability by default. The devcontainer is explicitly designed for AI agents to autonomously build, test, and deploy. OutLayer provides TEE-attested off-chain computation with Intel TDX hardware guarantees — cryptographic proof that your code ran with your inputs, verifiable by anyone, with no trust in the operator required.

**Settlement and value.** NEAR Intents is an intent-based cross-chain settlement protocol with $15B+ cumulative volume across 35+ chains. Users express outcomes, solvers compete, settlement is atomic. This is composable value transfer — the same compositional primitive, applied to economic flow.

**Treasury and organization.** Trezu manages multi-chain treasury operations with $72M assets under management across 200+ teams — non-custodial multisig, bulk payments, audit-ready exports. The organizational layer for the agent economy.

**Identity and action.** better-near-auth extends Better-Auth with NEAR SIWN — cryptographic sign-in where the user proves ownership of a NEAR account by signing a message with a private key only they control. No passwords. No OAuth delegation. Self-sovereign, on-chain, verifiable. The gasless relay (NEP-366) then lets authenticated users interact with smart contracts without paying gas — the server broadcasts signed delegate actions on their behalf, creating a verifiable audit trail where every transaction's predecessor_id is the user's on-chain identity.

**Composition.** everything.dev is the layer that unifies them. A runtime-composed site where published configuration defines how host, UI, API, and plugins load together. Not a framework that builds artifacts. A protocol that composes living systems.

everything.dev is to composable software what NEAR Intents is to composable value: the coordination protocol that lets all the other layers compose as if they were one system. NEAR Intents routes economic intent across chains. everything.dev routes compositional intent across runtimes. Both sit at the matching layer between what is requested and what is delivered, taking a cut on volume, with network effects that compound as more primitives join.

The ideology connecting them is consistent: **verification by default, composition as the primitive, open expression as the outcome.** Named accounts that are tradeable assets. DNS records that are on-chain state. Applications that are smart contracts. Frontends that compose from each other. Data that carries its own history. Computation that proves itself. Settlement that expresses intent. Identity that is cryptographic. Software that composes at runtime, verifies its integrity, and evolves without rebuilding.

This is the open expression of yourself online with type safety. Not a static page. Not a deploy artifact. A living, composable, verifiable runtime that you publish, others extend, and agents build upon — with provenance, integrity, and identity at every layer.

## Why Now

The agents can build. The creative economy is agent-native — Adobe wrapped 50+ tools into a composable surface, Contra is ranking AI models for creatives, BUILD is composing professional output in classrooms. Runtime composition tooling hit stable — Rspack 2.0 and Rsbuild 2.0 shipped April 22, 2026; Module Federation 2.0 went stable with decoupled runtime, dynamic types, and MCP integration; TanStack Intent formalized agent skill shipping in March. Build-time security is measurably, persistently broken — 45% failure rate flat for two years across 150+ models. Trust has replaced compute as the bottleneck. And NEAR's verification layer — from SIWN to Intents to IronClaw to everything.dev — shipped in the same window.

The Renaissance needs infrastructure. For the first time, the infrastructure exists.

## The Honest Frame

Could this fail? Yes. everything.dev competes with simpler frameworks — Next.js, Vite, plain Rspack — that are good enough for most use cases. Security of runtime loading remains genuinely hard: SRI is difficult with dynamic URLs, CSP conflicts with Module Federation. The NEAR ecosystem's L1 TVL is small, though increasingly that is the wrong metric — the value is in cross-chain volume routed ($15B+) and on-chain compositional throughput, not destination-chain deposits. Execution from the everything.dev team — converting infrastructure leadership into developer adoption — has historically been the hardest job.

The asymmetry holds. The downside if the thesis fails is bounded by framework commodity pricing. The upside if it works is being the composition layer for agent-built software — a position that does not exist as an investable thesis anywhere else.

In a world where agent-built code has a 45% security failure rate that hasn't improved in two years, where $1.46 billion was stolen via runtime JavaScript injection, where only 2.8% of scripts on the web have integrity protection, where the creative economy is going agent-native, and where the Transformer co-author says trust is the bottleneck — the question is not whether something becomes the composition layer for agent-built software.

The question is which one. And everything.dev — built on NEAR, with verifiable manifests, typed plugin contracts, on-chain discovery, compositional identity, and a Renaissance city-state of projects that each verify, compose, and open expression at their layer — is the most credible candidate.

That is the trade.

Not financial advice. Crypto is volatile and conviction is no substitute for position sizing.
