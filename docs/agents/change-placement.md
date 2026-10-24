# Change placement — bugs, missing capabilities, and pattern improvements

`docs/runtime-map.md` says **who owns what**. This says **what to do about it**.
One branch of this document answers one kind of need.

## First rule: sync-owned is a contribution channel, not a fence

A change that belongs in a synced path (`docs/agents/**`, `.agents/skills/**`,
`skills-lock.json`, workflows, `package.json`, AGENTS.md) goes **there** — and
goes **upstream in the same PR**: file or comment on the framework issue that
covers it and link it from your PR body. `bos upgrade` regenerates those files
(and the whole authored half of AGENTS.md) from the parent template, so a local
edit with no upstream counterpart **dies at the next upgrade**. Editing sync-owned
files is how improvements propose themselves; the linked issue is what makes them
permanent.

Do not work around the sync by stashing things in app-owned docs that belong in
the template — every child then re-solves the same problem. Make the improvement
here, describe it upstream, let every child inherit it.

## Bug

1. **Reproduce** it locally.
2. **Classify**: run `bos dev --ui remote --api remote` (or wipe the local
   override) and see if it still reproduces against the **pinned platform**. Also
   check the owner in the runtime map — code living in the `auth` source is not
   debugged here.
3. **Local** → fix it, add the test at the seam that caught it.
4. **Upstream** → **search existing issues first** (`gh issue list -R
   NEARBuilders/everything-dev --search "…"`); comment on the matching one with
   the repro, the `platform:` pin, and `.bos/logs/` output; file new only when
   the search is empty. If you need to keep working now, ship an interim local
   fix and open the follow-up cleanup ticket that links the upstream issue.

Done when: the fix is in the right package and the bug's upstream counterpart
(linked issue) is either applied or parked with a cleanup ticket.

## Missing capability

1. **Search before building** — check upstream issues, the framework docs, and
   the TanStack Intent skills (`pnpm dlx @tanstack/intent@latest load
   everything-dev#…`). Someone may have built it.
2. **Build the smallest reference implementation** with a cross-check and tests
   (`scripts/gen-runtime-map.mjs` is the model: generator + `verify-runtime-map`
   diff against the real engine + unit tests).
3. **File or comment upstream with the reference attached** — ask for the API
   shape you need, show what works.
4. **Keep the interim local, wired sync-safely**, and track the tech debt: hook
   scripts at app-owned keys (not template-owned script names), a cleanup ticket
   linking the upstream issue, and a reminder to verify at the next `bos
   upgrade`.

Done when: the capability is shipped upstream (or parked as linked tech debt)
and every child inherits it instead of each one re-building it.

## Pattern improvement

- **Child-specific** (citynode-only concepts): an ADR under
  [`docs/adr/`](../adr/) — the index links upstream ADRs by number.
- **Framework-wide**: an upstream ADR + PR, then a `platform:` pin bump here.
  Decision numbers cited across the repo resolve via
  [`docs/adr/README.md`](../adr/README.md).

Done when: the next agent who hits the same decision finds it already recorded.

## Improving this flow

This file lives in a synced path on purpose. If the flow is wrong, edit it here
and open the upstream issue in the same PR — that is the flow working.
