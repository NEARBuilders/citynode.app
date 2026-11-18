# City Node

Communities start from Places. Anyone can activate a Place from the Gazetteer, which creates its Node and its community; governance (DAO, stake, site, publication) is an upgrade the community applies for. Hierarchy is the places tree: a Node has no name, slug or parent of its own. "City Node" is brand copy for a community that runs a validator; user-facing copy says community and place, never organization.

## Places and communities

**Gazetteer**:
The catalog of Places (countries, subdivisions and cities from GeoNames, plus curated additions) and the only source of names, slugs, coordinates and hierarchy.
_Avoid_: node tree, map data

**Place**:
One Gazetteer entry: a unique slug, a name, an optional parent Place, coordinates and an optional boundary. It exists whether or not anyone has started a community there.
_Avoid_: node, city node, location (that's a discovery profile's free text)

**Community**:
The people around one Place, with members, teams and events. In code it is an auth organization; users only ever see "community".
_Avoid_: organization (internal only), org, city node

**Node**:
The association between one Place and the community that runs there: the place link, the community link, its Activation time and community metadata. Its name and slug are its Place's, and its parent is the Node of the nearest ancestor Place that has one. The one place-less Node is the hidden platform node behind platform stations.
_Avoid_: City Node (brand copy), place, tenant, node tree

**Activation**:
Starting a community at a Place: it creates the Node and the community and makes the activator its first member. Anyone signed in can do it, with no approval; it is the only way a community's Node is created.
_Avoid_: approval, provisioning, spawning a node

**Official Application**:
A community's request to become an official City Node, which platform admins review. Approval links its Sputnik DAO and unlocks governance (DAO, stake, site, publication). Activation never needs one.
_Avoid_: node proposal, provisioning saga, apply (the old flow)

**Tenant**:
The website a community runs (or a person's personal site): its account, domains and published config. The Node points at its Tenant (`nodes.tenant_id`) and the Tenant never points back. A site is optional for a community and a personal site has no Node, so the optional link lives on the Node.
_Avoid_: organization, site owner, node

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

**SlotResolver**:
The host's entry-URL seam (`entryUrls` in `everything-dev/ui/slot`) — one pure derivation from a stamped config slot (`EntrySlot`) to the URLs each surface loads: `web` (browser entry — bustered fixed name in development, pin-derived hashed outside it), `ssr` (server container entry; undefined when the slot has no SSR coordinates), and `browserManifest` (the pin-derived hashed mf-manifest, structurally absent for local slots — atomic-deploys 08). Surfaces resolve lazily and throw loudly outside development naming slot + surface; buster arithmetic (integrity for web, ssrIntegrity→containerVersion for the server) lives inside the module, never at call sites.
_Avoid_: resolveEntryUrlForEnv (the deleted per-surface helper), remoteEntryUrlOf/ssrEntryUrlOf/getSsrEntryUrl (the deleted per-site wrappers), buster at the call site

**Quiet build**:
The prerequisite dist builder in `everything-dev/build` — one function (`buildPackageQuietly`) over the three framework packages (every-plugin, better-near-auth, everything-dev), each identified by its staleness-check dist entry. Skips when the dist is fresh, rebuilds captured-output-quietly, and fails loudly on nonzero exit; used by `bos build`'s train and the `bos dev` boot build.
_Avoid_: buildEverythingDevQuietly/buildEveryPluginQuietly/buildBetterNearAuthQuietly (the deleted triplication), force-rebuild as the default path

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

## Reporting

**Event Report**:
An Organizer's answers about one Node Event after it has ended, kept against the event and its owner node; one per event, editable by the community's Organizers, read-only to platform admins, who mark it Reviewed.
_Avoid_: event feedback, post-event survey, discovery report (that's a visitor flagging content)

**Monthly Report**:
A community's free-form account of one calendar month (UTC), written by its Organizers, with that month's events held, check-ins, joins and new members saved alongside it when submitted; one per community per month, whichever of the community's nodes it is opened from, editable until the end of the following month, read-only to platform admins, who mark it Reviewed. Owed from November 2026, or from the month the community started if that is later, by every active community.
_Avoid_: monthly update, newsletter, monthly stats (the numbers are only part of it)

**Reviewed**:
A platform admin has read a report and marked it so; the community sees it. No approval, rejection or comments; editing the report clears it.
_Avoid_: approved, accepted, signed off

## Event onboarding

**Onboarding Code**:
A revocable, expiring, use-capped invitation tied to one Node Event that makes whoever redeems it a member of the node's organization and of that event's Event Team; shown as a QR code.
_Avoid_: join link, invite code, referral code, QR code (that's only its rendering)

**Event Team**:
A Team created for one Node Event whose members are the people who redeemed its Onboarding Codes; it is granted no Feature Areas unless an organizer adds them.
_Avoid_: event cohort, attendee list

**Organizer**:
A member who can create and revoke Onboarding Codes for a node's events, by belonging to a Team granted the events Feature Area, or by being an organization owner or admin.
_Avoid_: event admin, host

**Passkey Wallet**:
The deterministic NEAR account derived from a member's passkey public key, linked to their user at onboarding; it exists as an address before it is activated on-chain.
_Avoid_: passkey account, embedded wallet, smart wallet

**Wallet Activation**:
The first request a Passkey Wallet sends, which carries the wallet contract's state-init and so makes the wallet live on-chain, at no cost to the member. A Passkey Wallet has no access keys: every request is a `w_execute_signed` call checked against the passkey signature, so any sender can relay it, including the first one.
_Avoid_: funding (that's the Sponsor topping up a key), creation

**Gateway Origin**:
The canonical citynode.app origin for a network, where every passkey ceremony takes place regardless of which tenant domain the member arrived from.
_Avoid_: base URL, main domain, tenant domain

**Device Link**:
Signing a desktop browser into an existing session by approving the desktop's QR code from a phone that is already signed in.
_Avoid_: device pairing, sync, cross-device passkey (the browser-native hybrid flow is a different mechanism)

## Regression stacks

**Stack**:
The fixture a regression suite runs against: `start` (the production command — the host booted over locally built, statically served artifacts via `bos start --config`) or `dev` (the dev server, `bos dev` — smoke-covered only).
_Avoid_: environment (that's `production`/`staging`), target

**Variant**:
The render mode a stack runs with: `ssr` (server-composed) or `csr` (no ssr URL — the client composes). Written `stack:variant` (e.g. `start:csr`); a bare stack name runs both variants serially (`test:regression:start` / `test:regression:dev`).
_Avoid_: mode (reserved for `production`/`staging` env), project

**Stall Watchdog**:
The Playwright reporter that fails the suite after minutes of zero test progress, printing a runner snapshot so a freeze produces evidence instead of eating the job timeout.
_Avoid_: timeout (the job-level kill; the watchdog exists because that kill loses artifacts)

## Gasless transactions

**Gas Key**:
A NEAR access key (NEP-611) with its own prepaid gas balance and parallel nonce lanes; gas burns from the key's balance, not the account's.
_Avoid_: prepaid key, allowance (a function-call key's allowance spends the account's own NEAR — a different mechanism)

**Session Gas Key**:
The browser-generated Gas Key scoped to the FastKV namespace's `__fastdata_kv` method, bootstrapped onto a user's account at their opt-in and used to sign platform writes locally.
_Avoid_: session key, FCAK, gas key (that's the protocol concept — be specific about which)

**Sponsor**:
The funding role of the ephemeral relayer account: it tops up Session Gas Keys via `TransferToGasKey` under server-enforced per-user caps.
_Avoid_: relayer for this role (the relayer is the NEP-366 role of the same account — say which you mean)

**Bootstrap**:
The one-time, wallet-signed `AddKey` transaction that installs a Session Gas Key on the user's account; refused for wallets whose manifest lacks `features.gasKeys`.
_Avoid_: provision, register

**Lane**:
One of a Gas Key's independent nonce sequences; parallel sends pick different Lanes and never serialize on each other.
_Avoid_: nonce (the per-lane counter), slot
