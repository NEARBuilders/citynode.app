# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — this repo's domain glossary (sections: Language, Organization access, Community discovery, Event onboarding, Regression stacks, Gasless transactions). `GLOSSARY.md` is a pointer to it.
- **`docs/adr/`**: this child repo has only an index (`docs/adr/README.md`) that resolves cited ADR numbers to the upstream framework repo. Read the relevant upstream ADR there.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is a single-context **child runtime** (it extends the published platform; the host and framework packages are not vendored). The layout is:

```
/
├── CONTEXT.md                         ← domain glossary
├── GLOSSARY.md                        ← pointer to CONTEXT.md
├── bos.app.ts                         ← authored runtime descriptor
├── docs/
│   ├── runtime-map.md                 ← what is local vs remote; how to override
│   ├── adr/README.md                  ← ADR number → upstream URL index
│   └── agents/                        ← this file and siblings
├── ui/                                ← local core ui (routes, components)
├── api/                               ← local API plugin
├── plugins/                           ← local plugins (registry, proposals)
├── scripts/                           ← repo tooling (gen-runtime-map, verify)
└── tests/                             ← regression suites + fixtures
```

Auth is a remote published plugin; there is no local `plugins/auth` workspace.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
