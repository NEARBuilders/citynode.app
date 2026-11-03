# Letting members propose to a Node DAO

> **Draft, not validated.** Decisions A and B are recorded (epic #408, 2026-11-02): members propose and vote on polls as **contributors**, the `Contributor` group in each Node DAO's policy. Nobody has run this recipe on mainnet yet. #407's observed run still has to run it and record the transaction. Don't hand it to a DAO's signers as final until then.

| Check | Status |
| --- | --- |
| #407 observed mainnet run | _pending: add the transaction link here_ |
| Decision A: who proposes | Contributors, the `Contributor` group in the Node DAO's policy |
| Decision B: what they propose | Polls first; other kinds later |

Membership stays in City Node: anyone who joined a community (by QR or invite) is a member of its organization, and that isn't recorded in the DAO's policy. The `Contributor` group is the next level. A member who wants to propose asks to join it, or the DAO's signers add them directly. Contributors can then file polls, vote on them and close expired ones.

Each Node DAO makes one policy change for this. Its signers propose and approve it in the tool they already use (Trezu). City Node doesn't change DAO policy and has no screen for it. It only reads the result (see [What City Node reads](#what-city-node-reads)).

Sputnik claims below cite [near-daos/sputnik-dao-contract][sdc] at `5434a59d`, the commit #412 was code-read against. The live Node DAOs run Sputnik v3.2 (`2b0f34a`), whose governance code matches it. All paths are under `sputnikdao2/src/`. Every fix below assumes the example policy, so check each DAO's own `get_policy` before applying it.

## What changes

Node DAOs set up in Trezu don't use Sputnik's default policy. Trezu's roles are `Requestor` (files transfers and function calls), `Approver` (shown as "Financial", votes on them) and `Admin` (shown as "Governance", handles membership and policy, including `add_member_to_role`). None of them has an Everyone role or a `vote` permission today. The change:

1. **Raises every quorum to `"1"`**: the policy's `default_vote_policy` and the `Contributor` group's own poll vote policy. Without it, an empty `Contributor` group lets one signer pass anything; see [An empty group passes everything](#an-empty-group-passes-everything).
2. **Adds a `Contributor` group**, empty or with the first contributors, that may add polls, vote approve or reject on them and finalize expired ones, with a poll threshold the group can reach.
3. **Lets members ask to become contributors**, by granting `add_member_to_role:AddProposal` to an Everyone role (#477).
4. **Sets `proposal_bond`.** It doesn't have to be 0; see [Bond](#bond).

Every other role, vote policy, `proposal_period` and bounty setting stays as it is. Use the role name `Contributor` in every Node DAO: a member's request names the role it adds them to, and City Node finds pending requests by it.

## How Sputnik checks permissions

- `add_proposal` asks the policy whether the caller may perform `AddProposal` on the proposal's kind, and panics with `ERR_PERMISSION_DENIED` if not ([proposals.rs:566-576][add-perm]). Votes go through the same check with `VoteApprove`, `VoteReject` or `VoteRemove` ([proposals.rs:609-612][act]).
- The caller matches every role whose kind fits them: `Everyone` always matches, `Group` matches listed accounts, and `Member` matches a delegated token weight at or above the threshold ([policy.rs:24-32][match-user]). The comment on `Everyone` says "who is not matched by other roles" ([policy.rs:16][everyone-doc]), but the code matches every account, signers included.
- A matched role allows an action if its `permissions` contain any of four strings ([policy.rs:333-359][can-execute]): `<kind>:<action>`, `<kind>:*`, `*:<action>` or `*:*`.
- `<kind>` is the proposal kind's policy label ([proposals.rs:125-147][labels]). A poll (`Vote`) is `vote` and a membership request (`AddMemberToRole`) is `add_member_to_role`. A permission for one kind never authorizes another.

## The `Contributor` role

```json
{
  "name": "Contributor",
  "kind": { "Group": [] },
  "permissions": ["vote:AddProposal", "vote:VoteApprove", "vote:VoteReject", "vote:Finalize"],
  "vote_policy": {
    "vote": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] }
  }
}
```

- **Exact permissions only.** `vote:*` would also give `VoteRemove`, and `*:AddProposal` would let contributors file transfers and policy changes. Contributors never get `VoteRemove`: removing a poll deletes it and forfeits its bond ([proposals.rs:644-648][vote-outcome]).
- **`vote:Finalize` lets contributors close expired polls.** Finalize casts no vote. On an open poll that no role has decided it fails with `ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED`; on an expired one it closes the poll and returns the proposer's bond ([proposals.rs:665-685][finalize]). Without it nobody can close an expired poll, because none of Trezu's roles grants `vote:Finalize`, and Finalize then fails with `ERR_PERMISSION_DENIED` ([proposals.rs:609-612][act]).
- **A threshold the group can reach.** Votes are counted per role, and a poll is approved or rejected as soon as one role's count reaches that role's threshold for the `vote` label ([policy.rs:378-434][proposal-status], [proposals.rs:256-283][update-votes]). The vote policy above is the default ratio: more than half of the group. A ratio grows with the group, so a large group where few people vote leaves polls to expire. A fixed weight such as `"threshold": "3"` needs that many votes, capped at the group's size ([policy.rs:96-107][weight]). #407 records which one it ran.
- **`"quorum": "1"`, never `"0"`.** The threshold is the larger of the quorum and the weight ([policy.rs:414-417][proposal-status]), and the weight of an empty group is 0. With quorum 0, a poll passes with no votes once the last contributor is removed; see the next section.
- **A poll only records the outcome.** Approving a `Vote` proposal executes nothing ([proposals.rs:431][execute]); its bond is returned at once.
- **Leave polls to contributors.** A signer role that can vote on polls, including through `*:VoteApprove` or `*:*`, has its own threshold, and a small signer group would settle a poll before the contributors do. Don't add `vote` grants, `vote:Finalize` included, to signer roles, and check that no signer wildcard covers `vote`.

### An empty group passes everything

`Finalize` recomputes a proposal's status over **every** role in the policy, not only the caller's ([proposals.rs:665-670][finalize]). A `Group` role with no members has a threshold of max(quorum, 0), so with quorum `"0"` it counts 0 approvals as enough and the proposal is approved and executed ([policy.rs:96-107][weight], [policy.rs:378-434][proposal-status]).

The group is created empty, and a role with no `vote_policy` entry for a label uses `default_vote_policy`. So while the `Contributor` group is empty and any quorum is `"0"`, one signer can file a proposal and finalize it straight away, without the other signers: an `Admin` with `policy:*` could pass a `ChangePolicy` that rewrites every role, and on a live Node DAO, where each `Approver` holds `transfer:Finalize`, one Approver could push a transfer through. That window lasts until the first contributor is added, and reopens whenever the last one is removed.

Setting both quorums to `"1"` closes it: an empty group then needs one approval it can never cast. Signer groups and a non-empty `Contributor` group already need at least one vote, so nothing else changes. Adding a first contributor isn't enough on its own, since the hole comes back when the last one leaves.

### Risks while polls are open

- **Never vote on an expired poll.** Sputnik still accepts the vote on a poll whose period has passed but that nobody finalized, stores it as `Expired` and returns no bond ([proposals.rs:624-656][act], [policy.rs:393-396][proposal-status]; Sputnik's own `test_vote_expired_proposal` shows the vote is accepted). Finalize then fails with `ERR_PROPOSAL_NOT_IN_PROGRESS` for good ([policy.rs:386-392][proposal-status]), so the proposer's bond stays locked. Trezu and City Node should offer Finalize, not a vote, on an expired poll.
- **Removing contributors can change an open poll's result.** The votes already cast stay counted, but the threshold shrinks with the group. Remove enough contributors and a poll's existing approvals can reach the new threshold; the next vote or Finalize on it then approves it. This is why signers don't get `vote:Finalize`: with it they could remove contributors and apply the new result themselves. Avoid removing contributors while polls they voted on are open.

## Becoming a contributor

There are two ways, and the Node DAO approves both (#477):

- **The member asks.** Their Passkey Wallet files an `AddMemberToRole` proposal for the `Contributor` role. That needs an Everyone role with `add_member_to_role:AddProposal`:

  ```json
  {
    "name": "all",
    "kind": "Everyone",
    "permissions": ["add_member_to_role:AddProposal"],
    "vote_policy": {}
  }
  ```

- **Signers add them.** A Governance (`Admin`) signer files the same proposal in Trezu. Trezu's `Admin` role already has `add_member_to_role`.

The proposal is `{ "AddMemberToRole": { "member_id": "member-one.near", "role": "Contributor" } }` ([proposals.rs:72-73][add-member-kind]). On approval it adds the account to the group ([policy.rs:292-305][add-member]). It passes under the signer roles' vote policy for `add_member_to_role`, as it does today.

Watch for three things:

- **Anyone can file a request.** The Everyone grant lets any NEAR account file one, not only members. With a bond of 0 that's free, so requests from accounts that aren't members can pile up. A positive bond discourages that, but the member pays it.
- **A request can name any role.** `add_member_to_role:AddProposal` doesn't limit the role. Before approving, check that the role is `Contributor` and that the account is the member's Passkey Wallet. Never approve a request that adds someone to a signer role.
- **Only Governance can close an expired request.** Finalizing an `AddMemberToRole` request needs `add_member_to_role:Finalize` ([proposals.rs:609-612][act]), which in Trezu's setup only `Admin` holds, through `add_member_to_role:*`. Contributors' `vote:Finalize` covers polls, not requests. With a positive bond, an expired request's bond stays locked until a signer finalizes it.

### First, keep the signers able to propose

If a DAO already has an Everyone role, don't replace it with the one above without checking. A DAO whose signers can only propose through Everyone, for example through the default `*:AddProposal` ([policy.rs:185-192][default-policy]), would leave nobody able to add a proposal, including the `ChangePolicy` that would undo it. Sputnik only grants what a role the caller matches lists ([policy.rs:333-359][can-execute]).

Before narrowing an existing Everyone role, check the current `get_policy`: a signer role other than Everyone must grant `AddProposal` for `policy` and every other kind the signers file, in one of the four forms. If none does, add that grant to the signer role in the same change. Narrowing it is still right: a leftover `*:AddProposal` on Everyone would let any account file polls, transfers and policy changes. If the DAO has no Everyone role, as in Trezu's setup, just add the one above.

## Bond

`add_proposal` requires an attached deposit **exactly** equal to `proposal_bond`, more or less fails with `ERR_MIN_BOND` ([proposals.rs:540-544][add-bond]). The default policy's bond is 1 NEAR ([policy.rs:211][default-policy]). The deposit is added to the DAO's locked amount ([proposals.rs:587][add-locked]).

| What happens to the proposal | The bond | Source |
| --- | --- | --- |
| Approved, and it executes without a cross-contract call (`Vote`, policy changes, config) | Returned at once | [proposals.rs:431, 461-470][execute] |
| Approved, and its call or transfer succeeds | Returned in the callback | [proposals.rs:473-490][callback-ok], [698-722][callback] |
| Approved, but its call or transfer fails | Kept locked; the proposal is `Failed` | [proposals.rs:492-498][callback-fail] |
| `Failed`, then finalized | Re-executed if still approved (returned on success); returned if it has expired | [proposals.rs:658-685][finalize] |
| Rejected by vote | Returned | [proposals.rs:649-652][vote-outcome], [500-520][reject] |
| Expired, then finalized | Returned | [proposals.rs:676-679][finalize] |
| Expired, not yet finalized | Kept locked until someone with `vote:Finalize` (a contributor, for polls) finalizes it | [proposals.rs:665-685][finalize] |
| Expired, then voted on | Kept locked for good: the vote stores it as `Expired` and Finalize then fails ([Risks while polls are open](#risks-while-polls-are-open)) | [proposals.rs:624-656][act], [policy.rs:386-396][proposal-status] |
| Removed by vote (`VoteRemove`) | Forfeited; the proposal is deleted | [proposals.rs:644-648][vote-outcome] |
| Deleted with `RemoveProposal` | Forfeited | [proposals.rs:620-623][remove] |

**The DAO returns its current bond, not the one the proposer paid.** `internal_return_bonds` transfers `policy.proposal_bond` from the policy at the time of return ([proposals.rs:339-349][return-bonds]). The policy change itself is safe: it's executed with the policy read before it ran ([proposals.rs:607, 641][act]), so its proposer gets the old bond back. But a proposal that was pending when the bond changed gets the new amount back, either way:

- **Lowering it:** one filed at 1 NEAR gets 0 back if the bond dropped to 0.
- **Raising it**, the likelier case: requests pile up at 0, the signers raise the bond to stop them, and every pending request they then reject, or every expired one that's finalized, is refunded the new bond from the treasury.

So settle pending proposals before changing the bond. Clear spam requests with `RemoveProposal` first: it deletes a request in one call and forfeits its bond ([proposals.rs:620-623][remove]), and `Admin`'s `add_member_to_role:*` already covers it for membership requests. Any one `Admin` can do that alone, as the current policy already allows. `VoteRemove` works too, but needs the full signer threshold on each request. Approve, reject or finalize the rest.

**A positive bond means the member's Passkey Wallet must hold that NEAR**, plus gas, before they sign. A new wallet starts empty. The bond doesn't have to be 0. Node DAOs set up in Trezu have 0 today. A positive bond discourages spam requests (see [Becoming a contributor](#becoming-a-contributor)), but members pay it. With a positive bond, the proposal screen (#413) shows the amount and the wallet's address before the member signs, and City Node doesn't fund wallets.

## Submitting the change from Trezu

A Governance (`Admin`) signer files it, attaching the DAO's **current** bond as the deposit. It passes under that role's vote policy, the same as any other policy change. Use the policy-change or custom-proposal option in Trezu. If Trezu's form can't express the change, file `add_proposal` with the arguments below. #407 records which Trezu path it used.

### Recommended: one `ChangePolicy`

One proposal raises the quorums, adds both roles and sets the bond together. `ChangePolicy` (label `policy`) **replaces the whole policy** ([proposals.rs:363-366][execute]), so:

1. Read the DAO's current policy with `get_policy` on `example.sputnik-dao.near`.
2. Copy it, set `default_vote_policy.quorum` to `"1"`, add the `Contributor` and Everyone roles and set `proposal_bond`. If the DAO already has an Everyone role, run the [signer check](#first-keep-the-signers-able-to-propose) first. Keep every other role, vote policy, `proposal_period` and bounty setting exactly as it is.
3. File it. Sputnik accepts only a full policy object here, not the council-list shorthand ([proposals.rs:546-551][add-validate]). Policy, role and vote policy JSON reject unknown fields ([policy.rs:14, 68, 124, 152][policy-types]), so keep the field names exact.

The proposer needs `policy:AddProposal` (or one of the other three forms covering `policy`).

Example `add_proposal` arguments. The `Requestor`, `Approver` and `Admin` roles stand in for whatever the DAO's `get_policy` returns; copy those, don't use these. The bond stays 0 here, so the deposit is 0:

```json
{
  "proposal": {
    "description": "Add the Contributor group for polls, and let members ask to join it",
    "kind": {
      "ChangePolicy": {
        "policy": {
          "roles": [
            {
              "name": "Requestor",
              "kind": { "Group": ["signer-one.near", "signer-two.near"] },
              "permissions": ["call:AddProposal", "transfer:AddProposal"],
              "vote_policy": {}
            },
            {
              "name": "Approver",
              "kind": { "Group": ["signer-one.near", "signer-two.near"] },
              "permissions": [
                "call:VoteApprove",
                "call:VoteReject",
                "call:VoteRemove",
                "call:Finalize",
                "transfer:VoteApprove",
                "transfer:VoteReject",
                "transfer:VoteRemove",
                "transfer:Finalize"
              ],
              "vote_policy": {}
            },
            {
              "name": "Admin",
              "kind": { "Group": ["signer-one.near", "signer-two.near"] },
              "permissions": [
                "config:*",
                "policy:*",
                "add_member_to_role:*",
                "remove_member_from_role:*",
                "policy_add_or_update_role:*",
                "policy_remove_role:*",
                "policy_update_default_vote_policy:*",
                "policy_update_parameters:*"
              ],
              "vote_policy": {}
            },
            {
              "name": "Contributor",
              "kind": { "Group": [] },
              "permissions": ["vote:AddProposal", "vote:VoteApprove", "vote:VoteReject", "vote:Finalize"],
              "vote_policy": {
                "vote": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] }
              }
            },
            {
              "name": "all",
              "kind": "Everyone",
              "permissions": ["add_member_to_role:AddProposal"],
              "vote_policy": {}
            }
          ],
          "default_vote_policy": {
            "weight_kind": "RoleWeight",
            "quorum": "1",
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

### Alternative: smaller proposals

If the signers would rather not resubmit the whole policy, the same result takes three or four proposals, each voted on separately:

- **The default quorum:** `ChangePolicyUpdateDefaultVotePolicy` (label `policy_update_default_vote_policy`, which Trezu's `Admin` holds). It replaces `default_vote_policy` as a whole ([policy.rs:271-274][update-default]; executed at [proposals.rs:448-453][execute]), so copy the DAO's current one and change only `quorum`:

  ```json
  { "ChangePolicyUpdateDefaultVotePolicy": { "vote_policy": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] } } }
  ```

- **The roles:** `ChangePolicyAddOrUpdateRole` (label `policy_add_or_update_role`), once for `Contributor` and once for `all`. A role with an existing name replaces it, otherwise it's added ([policy.rs:245-259][add-or-update]).

  ```json
  { "ChangePolicyAddOrUpdateRole": { "role": { "name": "Contributor", "kind": { "Group": [] }, "permissions": ["vote:AddProposal", "vote:VoteApprove", "vote:VoteReject", "vote:Finalize"], "vote_policy": { "vote": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] } } } } }
  ```

- **The bond**, only if it changes: `ChangePolicyUpdateParameters` (label `policy_update_parameters`). It changes only the parameters it's given ([proposals.rs:55-60][parameters], [policy.rs:276-290][update-parameters]; executed at [proposals.rs:454-459][execute]).

  ```json
  { "ChangePolicyUpdateParameters": { "parameters": { "proposal_bond": "0" } } }
  ```

Between the proposals the DAO is half changed, so the order in which the signers approve them matters:

1. Any signer-role grant the [signer check](#first-keep-the-signers-able-to-propose) calls for.
2. **The default quorum, before the group exists**, so there's never an empty `Contributor` group under quorum `"0"` ([An empty group passes everything](#an-empty-group-passes-everything)).
3. `Contributor`, then `all`, so a member's request has a role to name.
4. **The bond change, last**, once every other proposal from this change, and any other pending proposal, has been settled: approved, rejected or removed, and any expired or `Failed` one finalized ([proposals.rs:658-685][finalize]). Sputnik refunds the bond in force when it pays the refund ([proposals.rs:339-349][return-bonds]), so a proposal settled after the bond changes refunds the new amount, not what its proposer attached. The bond proposal itself runs under the policy read before it executes ([proposals.rs:607, 641][act]), so its own proposer gets back what they paid.

The proposer needs `AddProposal` for each of those labels.

## What City Node reads

`ui/src/lib/sputnik-proposals.ts` (from #435) reads the result; nothing in City Node writes it.

- `fetchSputnikPolicy(daoAccountId)` (`:164`) reads `get_policy` over public RPC, or returns `null`.
- `proposalPermission(policy, accountId, kind, delegationBalance?)` (`:301-315`) evaluates that policy the way `can_execute_action` does for `AddProposal`. It matches Everyone, Group and token-weighted Member roles (`accountInRoles`, `:217-230`) and the four permission forms (`permits`, `:195-208`) for one `SputnikProposalKindLabel` (`:176-193`). It returns `{ canPropose, reason, bondYocto }`, where `reason` is `allowed`, `no-account`, `no-policy`, `no-permission` or `bond-unavailable`, and `bondYocto` is the exact deposit in yoctoNEAR.
- A missing or unreadable policy, or a missing or malformed `proposal_bond`, never allows submission, and a malformed bond is never read as zero (`proposalBondYocto`, `:288-291`). Pass `delegationBalance` (`readDelegationBalance`, `:146`) only when the DAO has token-weighted Member roles.
- `proposerRoles(policy, kind)` (`:239-245`) and `canAccountPropose` (`:247-254`) are the older helpers; `canAccountPropose` still checks `call` only.

For the Proposals tab:

- **Can this member ask to become a contributor?** `proposalPermission(policy, walletAccountId, "add_member_to_role")` (#477).
- **Is this member a contributor, and can they file a poll?** `proposalPermission(policy, walletAccountId, "vote")` (#413). Show the bond from `bondYocto`.
- **Can they vote on a poll?** #412 now also asks the helper for `VoteApprove` and `VoteReject` on a kind. That read isn't on main yet.

Don't take the bond from `fetchProposalBond` (`:393-398`): it returns `"0"` when the read fails, and `proposeAsSession` (`:406-429`) attaches that value as the deposit.

The tests in `ui/src/lib/sputnik-proposal-permission.test.ts` cover a group role, Everyone with and without `AddProposal`, each permission form, a permission for another kind, and zero, positive, missing and malformed bonds.

[sdc]: https://github.com/near-daos/sputnik-dao-contract/tree/5434a59dec23ee0c49df8c8c4350c208a7e75b0b
[everyone-doc]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L16
[match-user]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L24-L32
[policy-types]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L65-L166
[default-policy]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L179-L216
[update-default]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L271-L274
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
[weight]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L96-L107
[proposal-status]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs#L378-L434
[add-member-kind]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L72-L73
[update-votes]: https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L256-L283
