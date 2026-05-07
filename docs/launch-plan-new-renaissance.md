# Launch Plan: A New Renaissance

## Overview

Thesis-to-product launch following the near-hydra pattern: a research-dense article establishes the "why," a quote-tweet delivers the "how" with an installable product.

## Deliverables

### 1. Article

**Title:** A New Renaissance: Why Software Must Compose or Collapse

**File:** `docs/article-new-renaissance.md`

**Structure:**
- I. The Fall — Vibe coding security crisis → supply chain collapse → agent attack vectors
- II. The Renaissance — Adobe/Contra/BUILD/TanStack Intent as pop-culture entry to the compositional thesis
- III. Claude Mythos — Agents as demigods: powerful, prolific, structurally untrustworthy. Illia quote on trust bottleneck.
- IV. Composable Software — The answer: composition protocol, not framework. Primitives table. "Runtime apps that compose, verify, and evolve without rebuilding."
- V. The NEAR Ecosystem as a Renaissance City-State — Project-by-project connection showing the ideology: verification by default, composition as the primitive, open expression as the outcome
- VI. Why Now — Convergence paragraph
- VII. The Honest Frame — Risks + asymmetry

**Target length:** ~2,800 words

**Venue:** Independent post with its own URL. Can also be adapted as a GitHub manifesto.

**Key data points with sources:**
- VibeWrench: 100 apps, avg 62.7, 89 critical (VibeWrench blog, March 2026)
- Lovable: 170/1,645 critical, 303 endpoints (Matt Palmer audit)
- Moltbook: breached 3 days, 1.5M tokens (Stack of Truths, ScanVibe)
- 45% AI code fails security, flat 2 years (Veracode 2025/2026)
- 10.5% functional + secure (SWE-Agent academic study)
- Bybit: $1.46B via JS injection (Sygnia/NCC Group forensic)
- 1,241 malicious npm packages, 15.3x increase (Endor Labs)
- Shai-Hulud: 1,000+ packages, 25K repos (JFrog)
- SRI: 2.8% median script coverage (Web Almanac 2025)
- Clinejection: 4K malware downloads (Cremit/SecuringAgents)
- Comment and Control: 3 vendors simultaneously (Aonan Guan/JHU)
- Adobe for creativity: 50+ tools as MCP (Adobe blog, April 28 2026)
- TanStack Intent: 45.5K weekly downloads (npm, 8 weeks)
- Illia quote: "Security is the biggest bottleneck" (Bankless, March 2026)
- NEAR Intents: $15B+ volume, 35+ chains (Sandmark analysis)
- Trezu: $72M AUM, 200+ teams (trezu.org)

### 2. Quote Tweet / Launch Post

```
announcing everything.dev 🧩

@NEARProtocol's composable software stack — runtime apps that compose, verify, and evolve without rebuilding.

→ 1 config, runtime-loaded ui + api + plugins
→ extend any published app, no rebuild needed
→ sign, publish, and inherit — all from one near account
→ agents build on composable primitives, not bundles

only on $NEAR

npm i -g everything-dev
https://github.com/nearbuilders/everything-dev
```

**Tweet is a quote-tweet of the article.** Every bullet maps 1:1 to a thesis claim:
- "1 config" → the verifiable manifest argument
- "extend any published app" → composition by inheritance, not from scratch
- "sign, publish, and inherit" → cryptographic identity + on-chain provenance
- "composable primitives, not bundles" → the core reframe

### 3. README Updates

**Changes to `/README.md`:**
- Reframe opening line from "Module Federation monorepo with runtime-loaded configuration" to thesis positioning
- Add "Why" section connecting to the article's argument (composable software for a verifiable internet)
- Add better-near-auth reference in Related Projects
- Add TanStack Intent reference (skills shipped with the project via AGENTS.md)
- Mention the NEAR ecosystem connection

**Changes to `/ui/public/README.md`:**
- Update "Why it matters" to reflect thesis positioning
- Add "Related ideas" entries: NameSky, near-dns, OutLayer, better-near-auth

### 4. Optional: GitHub Manifesto

A shorter, more developer-facing version of the thesis in `docs/MANIFESTO.md` — the GitHub-first, project-root positioning document. Less investment thesis, more developer tool thesis. Same structure but condensed.

## Launch Sequence

1. **Article published** at its own URL (Medium, Substack, or hosted)
2. **Tweet posted** as quote-tweet of the article
3. **README updated** to reflect thesis positioning
4. **Manifesto** (optional) added to repo

## One-Liner

**Runtime apps that compose, verify, and evolve without rebuilding.**

This is the product positioning. It appears in the tweet, the README, and the article. It maps to the three core claims:
- Compose — from shared primitives, not from scratch
- Verify — integrity hashes, on-chain provenance, cryptographic identity
- Evolve — runtime composition means changes deploy independently, no rebuild
