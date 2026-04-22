# Agent Instructions for everything-dev

This document provides operational guidance for AI agents working on the everything-dev codebase.

## Quick Reference

**Start Development:**
```bash
everything-dev dev --host remote   # Typical: remote host, local UI + API
# `bos` is an alias for the same CLI
```

**Production Preview:**
```bash
everything-dev start --no-interactive   # All remotes, production URLs
everything-dev start --env staging --no-interactive  # Staging environment
```

**Publish:**
```bash
bos publish           # Publish config to the temporary dev.everything.near registry
bos publish --deploy  # Build/deploy all workspaces, then publish
```

**Check Status:**
```bash
bos ps        # List running processes
bos status    # Check remote health
bos info      # Show configuration
```

## Development Workflow

### Typical Session
1. Run `everything-dev dev --host remote` to start development
2. UI available at http://localhost:3002, API at http://localhost:3014
3. Check `.bos/logs/` for process logs if issues occur
4. Use `bos kill` to clean up processes when done

### Isolating Work
- `everything-dev dev --api remote` - Work on UI only
- `everything-dev dev --ui remote` - Work on API only
- `everything-dev dev` - Full local (client shell by default)
- `everything-dev dev --ssr` - Full local with SSR enabled

### Debugging Issues

**API not responding:**
- Check `bos ps` to see if API process is running
- Check `.bos/logs/api.log` for errors
- Run `bos status` to verify remote health

**UI not loading:**
- Verify host is running: `bos ps`
- Check browser console for Module Federation errors
- Clear browser cache and retry

**Type errors:**
- Run `bun typecheck` (checks both ui and api)
- Ensure api/src/contract.ts is in sync with UI usage

## Environments

- **Production**: `bos start` or `APP_ENV=production bun run start`
- **Staging**: `bos start --env staging` or `APP_ENV=staging bun run start`
- **Preview**: Automatic per-PR deployments via GitHub Actions
- All environments use the same Docker image; configuration comes from `bos.config.json` and env vars

## Deploying

- Railway deployment with GHCR images
- Configured via `railway.json`
- Staging deploys on merge to main
- Preview deploys on PR open
- Required Railway env vars: `APP_ENV`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `HOST_DATABASE_URL`, `HOST_DATABASE_AUTH_TOKEN`, `CORS_ORIGIN`
- `BOS_ACCOUNT` and `GATEWAY_DOMAIN` are no longer required defaults — they come from `bos.config.json`

## Code Changes

### Making Changes
- **UI Changes**: Edit `ui/src/` files → hot reload automatically
- **API Changes**: Edit `api/src/` files → hot reload automatically
- **New Components**: Create in `ui/src/components/ui/`, export from `ui/src/components/index.ts`
- **New Routes**: Create file in `ui/src/routes/`, TanStack Router auto-generates tree

### Style Requirements
- Use semantic Tailwind classes: `bg-background`, `text-foreground`, `text-muted-foreground`
- No hardcoded colors like `bg-blue-600`
- No code comments in implementation
- Follow existing patterns in neighboring files

### Adding API Endpoints
1. For the thin API shell: Define in `api/src/contract.ts`, implement in `api/src/index.ts`
2. For registry routes: Define in `plugins/registry/src/contract.ts`, implement in `plugins/registry/src/index.ts`
3. For projects/KV/org routes: Define in `plugins/projects/src/contract.ts`, implement in `plugins/projects/src/index.ts`
4. For API endpoints that compose across plugins: Define in `api/src/contract.ts`, use `services.plugins.{key}()` in the handler
5. Use in UI via `apiClient.registry.*`, `apiClient.projects.*`, or `apiClient.ping` / `apiClient.authHealth`

### Plugin Architecture

Business logic is organized into independent plugins loaded via Module Federation:
- **`api/`** — Thin structural shell: ping, authHealth, error routes, middleware definitions
- **`plugins/registry/`** — FastKV app discovery, metadata publish/relay (no database)
- **`plugins/projects/`** — Projects CRUD, KV store, org management, API keys (SQLite via libsql)

Each plugin is self-contained with its own:
- `contract.ts` — oRPC route definitions and Zod schemas
- `index.ts` — `createPlugin` with variables, secrets, context, router
- Middleware (`requireAuth`, `requireNearAccount`, `requireOrgRole`) duplicated per plugin
- rspack config for independent deployment

The UI accesses plugin routes via namespaced clients: `apiClient.registry.listRegistryApps()`, `apiClient.projects.listProjects()`, etc.

### Plugin Client (pluginsClient)

The API plugin receives typed client factories for all other plugins via `createPlugin.withPlugins<PluginsClient>()`, enabling in-process composition without HTTP roundtrips:

```typescript
import type { PluginsClient } from "./plugins-client.gen";

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({ demoMessage: z.string().optional() }),
  contract,
  initialize: (config, plugins) =>
    Effect.sync(() => ({ plugins, demoMessage: config.variables.demoMessage ?? "not configured" })),
  createRouter: (services, builder) => ({
    myRoute: builder.myRoute.handler(async () => {
      const status = await services.plugins.registry().getRegistryStatus();
    }),
  }),
});
```

**Two-phase loading**: The host loads non-API plugins first (Phase 1), creates a `pluginsClient` map of `createClient` factories, then loads the API with that map injected (Phase 2). The host is generic — no plugin-specific code.

**Config flow**: Plugin variables come from `bos.config.json` → `plugins.{key}.variables`. API variables from `app.api.variables`. Both flow through Zod-validated `initialize(config)`.

**Plugin access paths**: Plugins are accessible both directly via HTTP (`/api/{key}/*`) and in-process via `services.plugins.{key}()`. The UI uses the HTTP path. The API uses the in-process path for composition.

**Generated types**: `api/src/plugins-client.gen.ts` and `ui/src/api-contract.gen.ts` are generated by `bun run sync:api-contract` (runs on `postinstall` and `typecheck`). These files are gitignored — always regenerated from `bos.config.json`.

## Git Workflow

**Always follow CONTRIBUTING.md for git workflow:**
- Create feature branches: `git checkout -b feature/description`
- Use semantic commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- Run tests and typecheck before committing
- Push to fork, open PR to main

See [CONTRIBUTING.md](./CONTRIBUTING.md) for complete workflow details.

## Changesets

**When to add a changeset:**
- Any user-facing change (features, fixes, deprecations)
- Breaking changes
- Skip for: docs-only changes, internal refactors, test-only changes

**Create changeset:**
```bash
bun run changeset
# Follow prompts to select packages and describe changes
```

**What happens in CI:**
- Changesets are versioned automatically on merge to main
- Releases published via `.github/workflows/release.yml`
- GitHub releases created for api and ui packages

## Documentation Hierarchy

| File | Purpose | Use When |
|------|---------|----------|
| **AGENTS.md** | This file - agent operational guide | Starting work on this repo |
| **README.md** | Human quick start, high-level overview | Understanding project basics |
| **CONTRIBUTING.md** | Contribution guidelines, git workflow | Preparing to contribute |
| **LLM.txt** | Deep technical reference | Implementing features, debugging |
| **api/README.md** | API-specific docs | Working on API plugin |
| **ui/README.md** | UI-specific docs | Working on frontend |
| **host/README.md** | Host-specific docs | Working on server |

## Available Skills

When working on this project, check for the `bos` skill:

```bash
npx openskills read bos
# Or read directly:
# .agent/skills/bos/SKILL.md
```

The `bos` CLI skill covers:
- Development workflows (`bos dev`, `bos start`)
- Build and deploy processes
- Project management commands
- Troubleshooting common issues

## Testing & Quality

**Before committing:**
```bash
bun test        # Run all tests
bun typecheck   # Type check all packages
bun lint        # Run linting (after setup)
```

## Common Patterns

### Authentication Check
Routes requiring auth use `_authenticated.tsx` layout:
```typescript
export const Route = createFileRoute('/_layout/_authenticated')({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session?.user) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } });
    }
  },
});
```

### API Client Usage
```typescript
import { apiClient } from '@/app';

// API shell routes
const { data } = await apiClient.ping();
const { data } = await apiClient.authHealth();

// Registry plugin routes
const { data } = await apiClient.registry.listRegistryApps({ limit: 24 });

// Projects plugin routes
const { data } = await apiClient.projects.listProjects({ ownerId: 'user.near' });
const { data } = await apiClient.projects.listKeys({ limit: 50 });
```

## Troubleshooting

**Process won't start:**
```bash
bos kill        # Kill all tracked processes
bun install     # Ensure dependencies
bos dev --host remote   # Restart
```

**Module Federation errors:**
- Check `bos.config.json` URLs are accessible
- Verify shared dependency versions match in package.json
- Clear browser cache

**Database issues:**
```bash
bun run db:push   # Push schema changes
bun run db:studio # Open Drizzle Studio
```

## Environment

**Required files:**
- `.env` - Secrets (see `.env.example`)
- `bos.config.json` - Runtime configuration (committed)

**Key env vars & ports:**
- `APP_ENV` - `production` or `staging` (derives domain from `bos.config.json`)
- 3000 - Host (when running full local)
- 3002 - UI dev server
- 3014 - API dev server

## Questions?

- Check the relevant README in this hierarchy
- Review LLM.txt for technical deep-dives
- See CONTRIBUTING.md for contribution questions
