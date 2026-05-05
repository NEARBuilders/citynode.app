export type CliCommandMeta = {
  commandPath?: string[];
  summary: string;
  description?: string;
  examples?: string[];
  interactive?: boolean;
  longRunning?: boolean;
  fields?: Record<string, { positional?: boolean; description?: string }>;
};

export const cliCommandMeta = {
  dev: {
    commandPath: ["dev"],
    summary: "Start a development session",
    interactive: true,
    longRunning: true,
  },
  start: {
    commandPath: ["start"],
    summary: "Start the production host",
    interactive: false,
    longRunning: true,
    fields: {
      env: { description: "Environment: production or staging" },
    },
  },
  build: {
    commandPath: ["build"],
    summary: "Build selected workspaces",
    interactive: false,
    fields: {
      packages: { positional: true, description: "Comma-separated package list" },
    },
  },
  config: {
    commandPath: ["config"],
    summary: "Print the loaded BOS configuration",
    interactive: false,
  },
  pluginAdd: {
    commandPath: ["plugin", "add"],
    summary: "Add a plugin attachment",
    interactive: false,
    fields: {
      source: {
        positional: true,
        description: "Plugin source (local:path, bos://account/plugins/name, or URL)",
      },
      as: { description: "Plugin alias" },
      production: { description: "Production URL override" },
    },
  },
  pluginRemove: {
    commandPath: ["plugin", "remove"],
    summary: "Remove a plugin attachment",
    interactive: false,
    fields: { key: { positional: true, description: "Plugin key" } },
  },
  pluginList: {
    commandPath: ["plugin", "list"],
    summary: "List configured plugins",
    interactive: false,
  },
  pluginPublish: {
    commandPath: ["plugin", "publish"],
    summary: "Publish a single plugin",
    interactive: false,
    fields: { key: { positional: true, description: "Plugin key" } },
  },
  publish: {
    commandPath: ["publish"],
    summary: "Publish the current workspace configuration",
    interactive: false,
  },
  keyPublish: {
    commandPath: ["key", "publish"],
    summary: "Generate a publish access key",
    interactive: false,
  },
  init: {
    commandPath: ["init"],
    summary: "Scaffold a new project from a bos template",
    interactive: true,
    fields: {
      domain: {
        positional: true,
        description: "New project domain (e.g. ironclaw.everything.dev)",
      },
      account: { description: "New project NEAR account (auto-derived from domain)" },
      extendsAccount: {
        description: "Parent NEAR account to extend from (defaults to dev.everything.near)",
      },
      extendsGateway: {
        description: "Parent gateway to extend from (defaults to everything.dev)",
      },
      directory: { description: "Target directory (auto-derived from domain)" },
      source: { description: "Local source dir (skips GitHub download)" },
      withHost: { description: "Include host/ in template output" },
      noInteractive: { description: "Skip prompts, use flags only" },
      noInstall: { description: "Skip bun install" },
    },
  },
  sync: {
    commandPath: ["sync"],
    summary: "Sync template files from parent project",
    interactive: false,
    fields: {
      dryRun: { description: "Preview changes without writing files" },
      force: { description: "Overwrite user-modified files" },
      noInstall: { description: "Skip bun install" },
    },
  },
  upgrade: {
    commandPath: ["upgrade"],
    summary: "Upgrade framework packages and sync template files",
    interactive: false,
    fields: {
      dryRun: { description: "Preview changes without writing" },
      force: { description: "Overwrite user-modified files during sync" },
      noInstall: { description: "Skip bun install" },
      noSync: { description: "Only upgrade packages, skip template sync" },
    },
  },
  status: {
    commandPath: ["status"],
    summary: "Show project health, versions, and update availability",
    interactive: false,
  },
} as const satisfies Record<string, CliCommandMeta>;
