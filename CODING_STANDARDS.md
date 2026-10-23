# Coding standards

Review-time rules. Each entry earns its place by a concrete failure this repo
has seen; mechanical violations get deterministic checks instead of prose here.

## CI gate flips need a green run

Flip a non-gating CI job to gating only after a green local run of that exact
job on the change being merged. Never gate on an expected fix ("upstream says
this is fixed") — gate on an observed pass. When a gate must come back off, the
commit records the blocking issue it waits on.

*Seen in:* the rc.17 upgrade gated `regression-browser` on the assumption the
#527 fix would turn it green; it didn't, the merge gate went red, and the gate
was reverted in a follow-up commit.
