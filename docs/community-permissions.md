# Community permissions

Community settings are available only to the community's organization owners and
admins, personal tenant owners, and platform admins. The server filters
`listTenants` accordingly and checks the same policy for private binding reads and
binding changes. The `/tenant/$tenantId` route checks a fresh server response
before loading the settings page. The community's published config (homepage and
node config) is edited in that same Community settings page; the organization page
links owners and admins there (switching to the organization first when it is not
active), and the retired `?tab=homepage` / `?tab=node-config` URLs redirect there
for them and to the Members tab for everyone else.
Public community discovery, staking, and hostname resolution remain available;
public tenant responses omit ownership and override permission settings. The
public host-routing manifest still includes the runtime flags needed to serve
community sites.

## Role matrix

| Action | Public / outsider | Org member | Org admin | Org owner | Platform admin |
| --- | --- | --- | --- | --- | --- |
| Discover communities and read public content | Yes | Yes | Yes | Yes | Yes |
| Open community settings / read private bindings | No | No | Own active org | Own active org | All |
| Manage organization teams and area assignments | No | No | Own org | Own org | Requires org membership through Better Auth |
| Rename community / change UI, backend, SSR permissions | No | No | No | Own active org | Requires the active org owner role |
| Suspend / reactivate community | No | No | Own active org | No (existing admin-only middleware) | Requires the active org admin role |
| Delete community | No | No | No | Own active org | Requires the active org owner role |
| Edit homepage or publish config | No | No | Own org, with required signing authority | Own org, with required signing authority | With required signing authority |

Visibility of the settings page is enforced by role and cannot be toggled for
regular members. Owners manage community naming and override permissions; admins
and owners manage team feature-area assignments. Publicly published runtime
configuration remains public on-chain. Settings visibility grants no signing
authority over a DAO or NEAR account.

## Default teams and area access

| Team | Assigned areas |
| --- | --- |
| Operations | Node operations (`node-operations`) |
| Treasury | Finance (`finance`), Stake (`stake`) |
| Community | Events (`events`) |

Approval creates these teams in the same transaction that activates the org.
Migration `0011_default-community-teams` provisions already-active organizations;
the Community teams it created also store a `things` grant, which is ignored now
that `things` is no longer a feature area.
Activation also repairs active organizations that have not yet been provisioned.
Personal organizations (whose slug is their user's ID), pending requests, and
rejected requests are excluded. Existing teams with the same name are preserved,
including their areas and membership. Teams start empty; admins explicitly assign
members. A provisioning timestamp prevents duplicate creation and preserves later
renames, area changes, and deletions across repeated activation.

Owners, org admins, and platform admins bypass feature-area restrictions. On the
server, a regular member may use an area when any team they belong to in the
active organization is assigned it, whatever team is active; the active team
never narrows API access. A member with no such team, for example one who joined
through an onboarding code, is refused and told to ask an owner or admin to add
them to a team with that area. Individual routes still
enforce their own authentication and organization checks.

Node operations follow this rule. Node edits (`createNode`, `spawnNode`,
`updateNode`, `setNodeBulletin`, `deleteNode`) and validator edits
(`createValidator`, `updateValidator`, `setDefaultValidator`, `deleteValidator`)
are open to platform admins, the node's organization owners and admins, and
members of any of that organization's teams granted `node-operations`. A grant in
another organization never reaches a node outside it, and organization API keys
cannot make these edits. `deleteNode` also requires the org admin role. Feature
areas never grant community settings access, regardless of team membership.
