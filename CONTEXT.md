# City Node

A geographic node in the City Node network, owned by a node DAO and optionally backed by a staking pool.

## Language

**Node DAO Account**:
The node DAO's NEAR account — the account that stakes into the node's pool.
_Avoid_: team account, team wallet, org account, user wallet

**Staking Pool**:
The validator pool contract the node resolves for staking.
_Avoid_: validator (the metadata record), total staked (the whole pool)

**Node DAO Stake**:
The Node DAO Account's current stake in the node's Staking Pool, including compounded validator rewards.
_Avoid_: available rewards (product label for this same quantity), total staked, pool stake

**Validator Rewards**:
NEAR already compounded into Node DAO Stake. Not a separately held balance.
_Avoid_: reward balance, pending rewards

## Organization access

**Team**:
A named sub-group within an organization that shares access to the organization's feature areas.
_Avoid_: team account, team wallet, node DAO

**Active Team**:
The Team currently selected for a user's organization work.
_Avoid_: current team, team account

**Feature Area**:
A product capability that an organization can grant to a Team.
_Avoid_: permission, role

**Team Workspace**:
The organization view scoped to an Active Team and its granted feature areas.
_Avoid_: node workspace, organization account

## Community discovery

**Discovery Profile**:
A node's public community identity, including its chosen geographic location and official social channels.
_Avoid_: validator profile, node DAO account

**Community Activity**:
A published event or social update associated with a node and visible to visitors.
_Avoid_: staking activity, validator uptime

**Active Node**:
A publicly discoverable node with recent Community Activity or an upcoming published event.
_Avoid_: online node, active validator

**Node Event**:
A community gathering associated with one or more nodes, with a scheduled time and a public destination for event details or registration.
_Avoid_: blockchain event, transaction

**Social Update**:
A node-associated public post with an attributed source, original publication time, and a link to the original content.
_Avoid_: social account, imported activity
