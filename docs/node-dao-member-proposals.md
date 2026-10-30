# Letting members propose to a Node DAO

> **Draft, not validated.** Nobody has run this recipe on mainnet yet. Spike #407 runs it and records the transaction. Decision A picks the role members propose under, and decision B picks the proposal kinds (epic #408). Until #407 has run and both decisions are recorded, this page describes both decision A variants side by side, and the kinds are decision B's candidates. Don't hand it to a DAO's signers as final.

| Check | Status |
| --- | --- |
| #407 mainnet transaction | _pending #407: add the transaction link here_ |
| Decision A (Everyone or a Members group) | _open_ |
| Decision B (which kinds members propose) | _open_ |

Each Node DAO makes one policy change that does two things: it lets its members add proposals, and it lowers the proposal bond to an amount a member can pay, ideally 0. The DAO's signers propose and approve that change in the tool they already use (Trezu). City Node doesn't change DAO policy and has no screen for it. It only reads the result (see [What City Node reads](#what-city-node-reads)).

Sputnik claims below cite [near-daos/sputnik-dao-contract][sdc] at `5434a59d`, the commit #412 was code-read against. All paths are under `sputnikdao2/src/`.

## How Sputnik decides who may propose

- `add_proposal` asks the policy whether the caller may perform `AddProposal` on the proposal's kind, and panics with `ERR_PERMISSION_DENIED` if not ([proposals.rs:566-576][add-perm]).
- The caller matches every role whose kind fits them: `Everyone` always matches, `Group` matches listed accounts, and `Member` matches a delegated token weight at or above the threshold ([policy.rs:24-32][match-user]). The comment on `Everyone` says "who is not matched by other roles" ([policy.rs:16][everyone-doc]), but the code matches every account, council members included.
- A matched role allows the action if its `permissions` contain any of four strings ([policy.rs:333-359][can-execute]):
  1. `<kind>:AddProposal`
  2. `<kind>:*`
  3. `*:AddProposal`
  4. `*:*`
- `<kind>` is the proposal kind's policy label ([proposals.rs:125-147][labels]). A permission for one kind never authorizes another.
- The default policy gives an `all` role (kind `Everyone`) the permission `*:AddProposal`, and a `council` group everything except `RemoveProposal` ([policy.rs:179-216][default-policy]).

### Permission strings for decision B's candidates

| Decision B candidate | Sputnik proposal kind | Policy label | Exact permission |
| --- | --- | --- | --- |
| Polls | `Vote` | `vote` | `vote:AddProposal` |
| Community page changes | `FunctionCall` (config write) | `call` | `call:AddProposal` |
| House of Stake votes | `FunctionCall` (vote with the snapshot proof) | `call` | `call:AddProposal` |

Labels: `Vote` is `vote` ([proposals.rs:138][labels]) and `FunctionCall` is `call` ([proposals.rs:131][labels]).

What each of the four forms would grant a member role, for kind `vote` (the same holds for `call`):

| Form | Example | What it grants | Use for members? |
| --- | --- | --- | --- |
| `<kind>:AddProposal` | `vote:AddProposal` | Adding polls only | **Yes.** Grant one per kind decision B picks |
| `<kind>:*` | `vote:*` | Adding polls, and also voting on, removing and finalizing them | No: members would approve their own proposals |
| `*:AddProposal` | `*:AddProposal` | Adding every kind, including `policy`, `transfer` and `upgrade_self` | No: the default Everyone grant, and broader than decision B |
| `*:*` | `*:*` | Every action on every kind | Never |

`call:AddProposal` lets a member propose any function call, not only the ones City Node builds. Sputnik can't scope a permission by receiver or method. The council's approval is what stops other calls, so approvers should check what a call does before approving it.

Members never get `VoteApprove`, `VoteReject`, `VoteRemove`, `RemoveProposal` or `Finalize`. Proposing isn't voting: every member proposal still passes only under the council's installed threshold.

## Decision A, side by side

| | Variant 1: a Members group | Variant 2: Everyone |
| --- | --- | --- |
| Roles that change | Add a `members` group role. Remove the overlapping `AddProposal` grant from the Everyone role (or remove that role). | Narrow (or add) the Everyone role to the chosen kinds only. |
| Who can propose | Only accounts listed in the group | Any NEAR account |
| Per join | Each new member's Passkey Wallet account is added by an `AddMemberToRole` proposal the council approves (label `add_member_to_role`, [proposals.rs:129][labels]; executed by [policy.rs:292-305][add-member]) | Nothing |
| Spam exposure | Low: only members | Anyone can file polls and calls. With a zero bond nothing discourages it, and the council rejects or removes them |
| What #407 checks | No overlapping Everyone grant, and an unrelated account is refused | An unrelated account succeeds, and the exposure difference |
| Council and thresholds | Unchanged | Unchanged |

### Variant 1: a Members group

The role to add:

```json
{
  "name": "members",
  "kind": { "Group": ["member-one.near", "member-two.near"] },
  "permissions": ["vote:AddProposal", "call:AddProposal"],
  "vote_policy": {}
}
```

The Everyone role must not grant `AddProposal` for the same kinds in any of the four forms, or anyone can still propose them. The default `all` role has `*:AddProposal`, which covers every kind, so remove that permission (leaving `"permissions": []`) or remove the role in the same change.

### Variant 2: Everyone

The Everyone role, narrowed from the default `*:AddProposal` to the chosen kinds:

```json
{
  "name": "all",
  "kind": "Everyone",
  "permissions": ["vote:AddProposal", "call:AddProposal"],
  "vote_policy": {}
}
```

If the DAO has no Everyone role, add this one. Leaving the default `*:AddProposal` in place would also work for decision B's kinds, but it lets any account propose transfers, policy changes and upgrades too.

## Bond

`add_proposal` requires an attached deposit **exactly** equal to `proposal_bond`, more or less fails with `ERR_MIN_BOND` ([proposals.rs:540-544][add-bond]). The default policy's bond is 1 NEAR ([policy.rs:211][default-policy]). The deposit is added to the DAO's locked amount ([proposals.rs:587][add-locked]).

| What happens to the proposal | The bond | Source |
| --- | --- | --- |
| Approved, and it executes without a cross-contract call (`Vote`, policy changes, config) | Returned at once | [proposals.rs:431, 461-470][execute] |
| Approved, and its call or transfer succeeds | Returned in the callback | [proposals.rs:473-490][callback-ok], [698-722][callback] |
| Approved, but its call or transfer fails | Kept locked; the proposal is `Failed` | [proposals.rs:492-498][callback-fail] |
| `Failed`, then finalized | Re-executed if still approved (returned on success); returned if it has expired | [proposals.rs:658-685][finalize] |
| Rejected by vote | Returned | [proposals.rs:649-652][vote-outcome], [500-510][reject] |
| Expired, then finalized | Returned | [proposals.rs:676-679][finalize] |
| Expired, not yet finalized | Kept locked until someone with `Finalize` finalizes it. Members don't have that permission, so the council does | [proposals.rs:665-685][finalize] |
| Removed by vote (`VoteRemove`) | Forfeited; the proposal is deleted | [proposals.rs:644-648][vote-outcome] |
| Deleted with `RemoveProposal` | Forfeited | [proposals.rs:620-623][remove] |

**The DAO returns its current bond, not the one the proposer paid.** `internal_return_bonds` transfers `policy.proposal_bond` from the policy at the time of return ([proposals.rs:339-349][return-bonds]). The policy change itself is safe: it's executed with the policy read before it ran ([proposals.rs:607, 641][act]), so its proposer gets the old bond back. But a proposal that was pending when the bond dropped from 1 NEAR to 0 gets 0 back later. Approve, reject or finalize pending proposals before lowering the bond.

**A positive bond means the member's Passkey Wallet must hold that NEAR**, plus gas, before they sign. A new wallet starts empty. Per the product owner (2026-10-23), a DAO may keep a bond above zero; the proposal screen (#413) then shows the amount and the wallet's address before the member signs, and City Node doesn't fund wallets.

## Submitting the change from Trezu

A signer whose role allows the proposal kind files it, attaching the DAO's **current** bond as the deposit. It passes under that kind's vote policy, the same as any other policy change. Use the policy-change or custom-proposal option in Trezu. If Trezu's form can't express the change, file `add_proposal` with the arguments below. #407 records which Trezu path it used.

### Recommended: one `ChangePolicy`

One proposal changes the role and the bond together, as #407 tests ("one policy change for role plus bond"). `ChangePolicy` (label `policy`) **replaces the whole policy** ([proposals.rs:363-366][execute]), so:

1. Read the DAO's current policy with `get_policy` on `example.sputnik-dao.near`.
2. Copy it, and change only the roles for your decision A variant and `proposal_bond`. Keep the council roles, vote policies, `proposal_period` and bounty settings exactly as they are.
3. File it. Sputnik accepts only a full policy object here, not the council-list shorthand ([proposals.rs:546-551][add-validate]). Policy, role and vote policy JSON reject unknown fields ([policy.rs:14, 68, 124, 152][policy-types]), so keep the field names exact.

The proposer needs `policy:AddProposal` (or one of the other three forms covering `policy`).

Example `add_proposal` arguments, variant 1, starting from a default-shaped policy with a two-signer council and lowering the bond to 0. Attach the current bond, 1 NEAR (`1000000000000000000000000` yoctoNEAR), as the deposit:

```json
{
  "proposal": {
    "description": "Let members propose polls and function calls, and lower the proposal bond to 0",
    "kind": {
      "ChangePolicy": {
        "policy": {
          "roles": [
            {
              "name": "all",
              "kind": "Everyone",
              "permissions": [],
              "vote_policy": {}
            },
            {
              "name": "council",
              "kind": { "Group": ["signer-one.near", "signer-two.near"] },
              "permissions": [
                "*:AddProposal",
                "*:VoteApprove",
                "*:VoteReject",
                "*:VoteRemove",
                "*:Finalize"
              ],
              "vote_policy": {}
            },
            {
              "name": "members",
              "kind": { "Group": ["member-one.near", "member-two.near"] },
              "permissions": ["vote:AddProposal", "call:AddProposal"],
              "vote_policy": {}
            }
          ],
          "default_vote_policy": {
            "weight_kind": "RoleWeight",
            "quorum": "0",
            "threshold": [1, 2]
          },
          "proposal_bond": "0",
          "proposal_period": "604800000000000",
          "bounty_bond": "1000000000000000000000000",
          "bounty_forgiveness_period": "86400000000000"
        }
      }
    }
  }
}
```

For variant 2, the `roles` list is the `all` role from [Variant 2](#variant-2-everyone) plus the unchanged `council` role, with no `members` role.

### Alternative: smaller proposals

If the signers would rather not resubmit the whole policy, the same result takes two or three proposals, each voted on separately:

- **The role:** `ChangePolicyAddOrUpdateRole` (label `policy_add_or_update_role`). A role with an existing name replaces it, otherwise it's added ([policy.rs:245-259][add-or-update]). Variant 1 needs two: add `members`, and replace `all` with empty permissions. Variant 2 needs one: replace (or add) `all`.

  ```json
  { "ChangePolicyAddOrUpdateRole": { "role": { "name": "members", "kind": { "Group": ["member-one.near"] }, "permissions": ["vote:AddProposal", "call:AddProposal"], "vote_policy": {} } } }
  ```

- **The bond:** `ChangePolicyUpdateParameters` (label `policy_update_parameters`). It changes only the parameters it's given ([proposals.rs:55-60][parameters], [policy.rs:276-290][update-parameters]; executed at [proposals.rs:454-459][execute]).

  ```json
  { "ChangePolicyUpdateParameters": { "parameters": { "proposal_bond": "0" } } }
  ```

Between the proposals the DAO is half changed. With variant 1, file the Everyone change last, so no member is shut out in between. The proposer needs `AddProposal` for each of those labels.

## What City Node reads

`ui/src/lib/sputnik-proposals.ts` (from #435) reads the result; nothing in City Node writes it.

- `fetchSputnikPolicy(daoAccountId)` (`:164`) reads `get_policy` over public RPC, or returns `null`.
- `proposalPermission(policy, accountId, kind, delegationBalance?)` (`:301-315`) evaluates that policy the way `can_execute_action` does. It matches Everyone, Group and token-weighted Member roles (`accountInRoles`, `:217-230`) and the four permission forms (`permits`, `:195-208`) for one `SputnikProposalKindLabel` (`:176-193`). It returns `{ canPropose, reason, bondYocto }`, where `reason` is `allowed`, `no-account`, `no-policy`, `no-permission` or `bond-unavailable`, and `bondYocto` is the exact deposit in yoctoNEAR.
- A missing or unreadable policy, or a missing or malformed `proposal_bond`, never allows submission, and a malformed bond is never read as zero (`proposalBondYocto`, `:288-291`). Pass `delegationBalance` (`readDelegationBalance`, `:146`) only when the DAO has token-weighted Member roles.
- `proposerRoles(policy, kind)` (`:239-245`) and `canAccountPropose` (`:247-254`) are the older helpers; `canAccountPropose` still checks `call` only.

For the proposal screen (#413): read the policy with `fetchSputnikPolicy`, then call `proposalPermission(policy, walletAccountId, "vote")` or `"call"` for each kind decision B picks, and show the bond from `bondYocto`. Don't take the bond from `fetchProposalBond` (`:393-398`): it returns `"0"` when the read fails, and `proposeAsSession` (`:406-429`) attaches that value as the deposit.

The tests in `ui/src/lib/sputnik-proposal-permission.test.ts` cover both decision A variants, each permission form, a permission for another kind, and zero, positive, missing and malformed bonds.

[sdc]: https://github.com/near-daos/sputnik-dao-contract/tree/5434a59dec23ee0c49df8c8c4350c208a7e75b0b
[everyone-doc]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L16
[match-user]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L24-L32
[policy-types]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L65-L166
[default-policy]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L179-L216
[add-or-update]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L245-L259
[update-parameters]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L276-L290
[add-member]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L292-L305
[can-execute]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L333-L359
[parameters]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L55-L60
[labels]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L125-L147
[return-bonds]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L339-L349
[execute]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L352-L471
[callback-ok]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L473-L490
[callback-fail]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L492-L498
[reject]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L500-L520
[add-bond]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L540-L544
[add-validate]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L546-L551
[add-perm]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L566-L576
[add-locked]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L587
[act]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L594-L696
[remove]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L620-L623
[vote-outcome]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L637-L656
[finalize]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L658-L685
[callback]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L698-L722
