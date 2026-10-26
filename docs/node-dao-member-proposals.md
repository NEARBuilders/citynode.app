# Letting members propose to a Node DAO

> **Draft.** The recipe below hasn't been validated on mainnet yet. Spike #407 runs it and records the transaction, decision A picks the role and decision B picks the kinds (epic #408). Until then, both decision A variants are described, and the kinds are the candidates from decision B.

Each Node DAO makes one policy change so that its members can add proposals and the bond is low enough for a member to pay, ideally 0. The DAO's signers propose and approve that change in their existing tools (Trezu). City Node doesn't change DAO policy and has no screen for it. It only reads the result (see [What City Node reads](#what-city-node-reads)).

Validated transaction: _pending #407_.

## What changes

One `ChangePolicy` proposal, so the role and the bond change together. It replaces the whole policy, so start from the DAO's current `get_policy` and change only:

1. **The role members propose under** (decision A, one of the two variants below).
2. **`proposal_bond`**, ideally `"0"`.

Leave the council and approver roles, their vote policies and `proposal_period` as they are. Members never get a `VoteApprove`, `VoteReject`, `VoteRemove`, `RemoveProposal` or `Finalize` permission. Proposing isn't voting: every member proposal still needs the council's approval under the installed threshold.

Only an account whose role has `policy:AddProposal` (or `policy:*`, `*:AddProposal`, `*:*`) can add the `ChangePolicy` proposal, and it passes under the vote policy for `policy` proposals. The proposer attaches the DAO's current bond as the deposit.

### Permissions for decision B's kinds

Sputnik checks `<kind>:AddProposal`, `<kind>:*`, `*:AddProposal` and `*:*`, where `<kind>` is the proposal kind's policy label (`sputnikdao2/src/policy.rs`, `can_execute_action`). Grant the exact `<kind>:AddProposal` for each kind decision B picks, never a wildcard:

| Decision B candidate | Sputnik proposal kind | Permission |
| --- | --- | --- |
| Polls | `Vote` | `vote:AddProposal` |
| Community page changes | `FunctionCall` (config write) | `call:AddProposal` |
| House of Stake votes | `FunctionCall` (vote with the snapshot proof) | `call:AddProposal` |

`call:AddProposal` lets a member propose any function call, not only the ones City Node builds. The council's approval is what stops the rest, so approvers should check what a call does before approving it.

## Decision A, variant 1: a Members group

Add a role:

```json
{
  "name": "Members",
  "kind": { "Group": ["member-one.near", "member-two.near"] },
  "permissions": ["vote:AddProposal", "call:AddProposal"],
  "vote_policy": {}
}
```

- Only listed accounts can propose. A member's Passkey Wallet account has to be added before they can, through an `AddMemberToRole` proposal the council approves (one per join, or batched).
- The Everyone role must not grant `AddProposal` for the same kinds, otherwise anyone can still propose. The default Sputnik policy gives Everyone `*:AddProposal`, so remove that permission (or the role) in the same change.

## Decision A, variant 2: Everyone

Add the kinds' permissions to the Everyone role (or add an Everyone role with only those permissions):

```json
{
  "name": "all",
  "kind": "Everyone",
  "permissions": ["vote:AddProposal", "call:AddProposal"],
  "vote_policy": {}
}
```

- Any NEAR account can propose those kinds, not only the community's members, and no per-join policy change is needed.
- With a zero bond nothing discourages spam proposals. The council removes or rejects them.

## Bond

`add_proposal` requires an attached deposit exactly equal to `proposal_bond` (1 NEAR in the default policy). A DAO may keep a bond above zero. The member then pays it from their Passkey Wallet, and the proposal screen shows the amount before they sign. A new wallet starts empty, so it has to be funded first.

Sputnik returns the bond after a successful approval executes, when the proposal is rejected, or when an expired proposal is finalized. A pending proposal or a failed execution keeps it locked, and removal forfeits it.

## What City Node reads

`proposalPermission(policy, accountId, kind, delegationBalance?)` in `ui/src/lib/sputnik-proposals.ts` evaluates the DAO's `get_policy` result the way Sputnik does. It matches Everyone, Group and token-weighted Member roles and the four permission forms. It returns whether the account may add that kind and the bond in yoctoNEAR. A missing or unreadable policy, or a missing or malformed `proposal_bond`, never allows submission. A malformed bond is never read as zero.
