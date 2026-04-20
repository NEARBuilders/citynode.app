---
name: bos
description: CLI alias for everything-dev Module Federation projects. Use when creating new BOS projects, publishing bos.config.json to the temporary dev.everything.near FastKV registry, syncing with remote configs (every.near/everything.dev), running development servers (`everything-dev dev` or `bos dev`), or building/deploying federated apps. Build/deploy → publish → sync workflow for shared configuration.
---

# everything-dev CLI (`bos` alias)

CLI for **everything-dev** Module Federation projects with runtime-loaded configuration. `bos` is the command alias for `everything-dev`.

## Quick Start

```bash
# Create new project (defaults to every.near/everything.dev template)
bos create project my-app

# Or with all arguments (no prompts)
bos create project my-app \
  --account myname.near \
  --testnet myname.testnet \
  --template bos://every.near/everything.dev

# Or sync an existing project with the root template
bos sync

# Start development (auto-detects missing packages → uses remote)
bos dev
```

## Development Workflow

**Auto-detection**: The CLI automatically detects which packages exist locally and uses remote mode for missing ones. No need to explicitly specify `--host=remote`, `--ui=remote`, etc.

```bash
bos dev                      # Alias for `everything-dev dev`
everything-dev dev           # Auto-detects: missing packages use remote
bos dev --host remote        # Explicit remote host (optional)
bos dev --ui remote          # Explicit remote UI (optional)  
bos dev --api remote         # Explicit remote API (optional)
bos dev --ssr                # Explicit local SSR
```

**Example output** when packages are missing:
```
  ⚙ Auto-detecting packages...
    host not found locally → using remote
    api not found locally → using remote
```

**Production mode:**

```bash
bos start --no-interactive              # All remotes, production URLs
bos start --env staging --no-interactive # Staging environment (staging domain)
```

## Deploy → Publish → Sync

The core workflow for sharing configuration:

```bash
# 1. Build/deploy all workspaces when needed (updates bos.config.json with production URLs)
bos publish --deploy

# 2. Publish config to the temporary FastKV registry
bos publish

# 3. Others sync from your published config
bos sync --account your.near --gateway your-gateway.com
```

**Default sync source:** `every.near/everything.dev`

## Key Commands

| Command | Description |
|---------|-------------|
| `bos create project <name>` | Scaffold new project (interactive or with args) |
| `bos sync` | Sync from every.near/everything.dev |
| `bos dev` | Development (auto-detects missing packages) |
| `bos start --no-interactive` | Production mode (`--env staging` for staging) |
| `bos build` | Build existing packages (skips missing) |
| `bos publish` | Publish config to the temporary FastKV registry |
| `bos info` | Show current configuration |
| `bos status` | Check remote health |

### Create Project Options

Create a new project with interactive prompts or skip prompts using arguments:

```bash
# Interactive (prompts for account, testnet, etc.)
bos create project my-app

# Skip all prompts with arguments
bos create project my-app \
  --account myname.near \
  --testnet myname.testnet \
  --template bos://every.near/everything.dev \
  --include-host \
  --include-gateway
```

| Option | Description |
|--------|-------------|
| `-a, --account <account>` | NEAR mainnet account (e.g., myname.near) |
| `--testnet <account>` | NEAR testnet account (optional) |
| `-t, --template <url>` | Template BOS URL (default: bos://every.near/everything.dev) |
| `--include-host` | Include host package locally (default: false, uses remote) |
| `--include-gateway` | Include gateway package locally (default: false, uses remote) |

### Auto-Detection Behavior

Commands automatically detect which packages exist locally:

| Command | Missing Package Behavior |
|---------|-------------------------|
| `bos dev` | Uses remote mode |
| `bos build` | Skips package |
| `bos publish --deploy` | Skips package |

### Process Management

| Command | Description |
|---------|-------------|
| `bos ps` | List all tracked BOS processes |
| `bos kill` | Kill all tracked processes (graceful SIGTERM → SIGKILL) |
| `bos kill --force` | Force kill all processes immediately (SIGKILL) |

Process tracking uses `.bos/pids.json` to track spawned processes for cleanup.

### Docker Commands

Use the repo `Dockerfile` directly for production containers.

```bash
docker build -t everything-dev .
docker run -p 3000:3000 everything-dev
```

The container uses `bun run start` and fetches config from the FastKV registry.

For full command reference, see [commands.md](docs/commands.md).

## Configuration

All runtime configuration lives in `bos.config.json`. See [types.md](docs/types.md) for the schema.

Key fields:
- `account` - NEAR account (mainnet)
- `testnet` - NEAR account (testnet)
- `staging` - Staging domain configuration
- `template` - Default template for scaffolding
- `app.host`, `app.ui`, `app.api` - Module configuration

## Workflow Patterns

For detailed workflow guides, see [workflows.md](docs/workflows.md):
- Creating a new project
- Syncing with upstream
- Publishing updates
- Working with secrets
- Gateway deployment

## File References

Key files for understanding the system:

- `bos.config.json` - Runtime configuration
- `packages/everything-dev/src/types.ts` - BosConfig schema
- `packages/everything-dev/src/cli.ts` - CLI implementation
- `packages/everything-dev/src/bos-plugin.ts` - Command handlers
