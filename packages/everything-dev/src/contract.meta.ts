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
      source: { positional: true, description: "Plugin source (local:path or URL)" },
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
      account: { positional: true, description: "Parent NEAR account (e.g., dev.everything.near)" },
      gateway: { positional: true, description: "Parent gateway ID (e.g., everything.dev)" },
      destination: { description: "Target directory (defaults to ./gateway)" },
      name: { description: "New project NEAR account" },
      domain: { description: "New project domain" },
      source: { description: "Local source dir (skips GitHub download)" },
      withHost: { description: "Include host/ in template output" },
      noInteractive: { description: "Skip prompts, use flags only" },
      noInstall: { description: "Skip bun install" },
    },
  },
} as const satisfies Record<string, CliCommandMeta>;
