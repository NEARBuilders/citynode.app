---
"every-plugin": patch
"everything-dev": minor
"host": minor
"api": minor
"@every-plugin/template": minor
"@every-plugin/settings": minor
---

Pass full organization and NEAR context from host to plugins

The host's `buildPluginContext()` now forwards the complete `organization`
and `near` objects from the auth plugin's `getContext()`, not just the
flat `organizationId` and `walletAddress` strings.

**Host:**
- Store full `contextResult.organization` and `contextResult.near` in
  Hono context variables during session middleware
- Pass both objects through `buildPluginContext()` to all plugins

**API plugin:**
- Add `organization` and `near` zod schemas to the context schema so
  routes and middleware can access org metadata (including `daoAccountId`
  from `organization.organization.metadata`) and NEAR capabilities

**Template & Settings plugins:**
- Expand context schema to reflect the full surface of available fields:
  `user`, `organization` (with `organization`, `member`, `isPersonal`,
  `hasOrganization`), `near` (with `primaryAccountId`, `linkedAccounts`,
  `hasNearAccount`), `walletAddress`, and `apiKey`
- Added documentation comment listing all available context fields

**CLI (everything-dev):**
- Fix type error in `resolveRemoteConfigChain` where `BosConfig` was
  passed as `BosConfigInput` to `mergeBosConfigWithExtends`
- Update plugin-development SKILL.md with a comprehensive Request Context
  Reference section documenting all fields, common patterns, and the
  minimal context pattern
