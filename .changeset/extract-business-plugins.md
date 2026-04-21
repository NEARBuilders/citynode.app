---
"api": major
"ui": minor
"@everything-dev/registry-plugin": minor
"@everything-dev/projects-plugin": minor
---

## Extract business logic into plugins

### Breaking changes (api)

All business routes have been removed from the `api` package. The API is now a thin structural shell with only health and error routes:

- **Removed**: `listRegistryApps`, `getRegistryApp`, `getRegistryAppsByAccount`, `getRegistryAppByHost`, `getRegistryStatus`, `prepareRegistryMetadataWrite`, `relayRegistryMetadataWrite` (moved to `plugins/registry/`)
- **Removed**: `listKeys`, `getValue`, `setValue`, `deleteKey` (moved to `plugins/projects/`)
- **Removed**: `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`, `listProjectApps`, `linkAppToProject`, `unlinkAppFromProject`, `listProjectsForApp` (moved to `plugins/projects/`)
- **Removed**: `listApiKeys`, `createApiKey`, `deleteApiKey` (moved to `plugins/projects/`)
- **Removed**: `listOrgMembers`, `listOrgInvitations`, `cancelInvitation`, `resendInvitation` (moved to `plugins/projects/`)
- **Kept**: `ping`, `authHealth`, `publicError`, `protectedError`
- **Kept**: `requireAuth`, `requireNearAccount`, `requireOrgRole` middleware (duplicated in plugins)

### New: registry plugin (`@everything-dev/registry-plugin`)

FastKV app discovery, metadata publish/relay. No database required.
- All registry routes from the API are now under `apiClient.registry.*`
- Configuration via `REGISTRY_RELAY_*` secrets and optional `registryNamespace` variable

### New: projects plugin (`@everything-dev/projects-plugin`)

Projects CRUD, KV store, org management, API keys. SQLite via libsql.
- All projects/KV/org/API key routes from the API are now under `apiClient.projects.*`
- Configuration via `PROJECTS_DATABASE_URL` and `PROJECTS_DATABASE_AUTH_TOKEN` secrets

### UI changes

All `apiClient` calls to business routes must now use namespaced access:
- `apiClient.listRegistryApps()` → `apiClient.registry.listRegistryApps()`
- `apiClient.getProject()` → `apiClient.projects.getProject()`
- `apiClient.listKeys()` → `apiClient.projects.listKeys()`
- etc.