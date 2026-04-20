import { oc, z } from "./sdk";
import { BosConfigSchema, SourceModeSchema } from "./types";

export const DevOptionsSchema = z.object({
  host: SourceModeSchema.default("local"),
  ui: SourceModeSchema.default("local"),
  api: SourceModeSchema.default("local"),
  proxy: z.boolean().default(false),
  ssr: z.boolean().default(false),
  port: z.number().optional(),
  interactive: z.boolean().optional(),
});

export const DevResultSchema = z.object({
  status: z.enum(["started", "error"]),
  description: z.string(),
  processes: z.array(z.string()),
});

export const StartOptionsSchema = z.object({
  port: z.number().optional(),
  interactive: z.boolean().optional(),
  account: z.string().optional(),
  domain: z.string().optional(),
  env: z.enum(["production", "staging"]).default("production"),
});

export const StartResultSchema = z.object({
  status: z.enum(["running", "error"]),
  url: z.string(),
});

export const BuildOptionsSchema = z.object({
  packages: z.string().default("all"),
  force: z.boolean().default(false),
  deploy: z.boolean().default(false),
});

export const BuildResultSchema = z.object({
  status: z.enum(["success", "error"]),
  built: z.array(z.string()),
  skipped: z.array(z.string()).optional(),
  deployed: z.boolean().optional(),
});

export const ConfigResultSchema = z.object({
  config: BosConfigSchema.nullable(),
  packages: z.array(z.string()),
  remotes: z.array(z.string()),
});

export const PluginAddOptionsSchema = z.object({
  source: z.string(),
  as: z.string().optional(),
  production: z.string().optional(),
});

export const PluginAddResultSchema = z.object({
  status: z.enum(["added", "error"]),
  key: z.string(),
  development: z.string().optional(),
  production: z.string().optional(),
  error: z.string().optional(),
});

export const PluginRemoveOptionsSchema = z.object({
  key: z.string(),
});

export const PluginRemoveResultSchema = z.object({
  status: z.enum(["removed", "error"]),
  key: z.string(),
  error: z.string().optional(),
});

export const PluginListResultSchema = z.object({
  status: z.enum(["listed", "error"]),
  plugins: z.array(
    z.object({
      key: z.string(),
      development: z.string().optional(),
      production: z.string().optional(),
      localPath: z.string().optional(),
      source: z.enum(["local", "remote"]),
    }),
  ),
  error: z.string().optional(),
});

export const PluginPublishOptionsSchema = z.object({
  key: z.string(),
});

export const PluginPublishResultSchema = z.object({
  status: z.enum(["published", "error"]),
  key: z.string(),
  path: z.string().optional(),
  script: z.string().optional(),
  production: z.string().optional(),
  error: z.string().optional(),
});

export const PublishOptionsSchema = z.object({
  deploy: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  packages: z.string().default("all"),
  network: z.enum(["mainnet", "testnet"]).optional(),
  privateKey: z.string().optional(),
});

export const PublishResultSchema = z.object({
  status: z.enum(["published", "error", "dry-run"]),
  registryUrl: z.string(),
  txHash: z.string().optional(),
  error: z.string().optional(),
  built: z.array(z.string()).optional(),
  skipped: z.array(z.string()).optional(),
});

export const KeyPublishOptionsSchema = z.object({
  allowance: z.string().default("0.25NEAR"),
});

export const KeyPublishResultSchema = z.object({
  status: z.enum(["published", "error"]),
  account: z.string(),
  network: z.enum(["mainnet", "testnet"]),
  contract: z.string(),
  allowance: z.string(),
  functionNames: z.array(z.string()),
  publicKey: z.string().optional(),
  privateKey: z.string().optional(),
  error: z.string().optional(),
});

export const bosContract = oc.router({
  dev: oc.route({ method: "POST", path: "/dev" }).input(DevOptionsSchema).output(DevResultSchema),
  start: oc
    .route({ method: "POST", path: "/start" })
    .input(StartOptionsSchema)
    .output(StartResultSchema),
  build: oc
    .route({ method: "POST", path: "/build" })
    .input(BuildOptionsSchema)
    .output(BuildResultSchema),
  config: oc.route({ method: "GET", path: "/config" }).output(ConfigResultSchema),
  pluginAdd: oc
    .route({ method: "POST", path: "/plugin/add" })
    .input(PluginAddOptionsSchema)
    .output(PluginAddResultSchema),
  pluginRemove: oc
    .route({ method: "POST", path: "/plugin/remove" })
    .input(PluginRemoveOptionsSchema)
    .output(PluginRemoveResultSchema),
  pluginList: oc.route({ method: "GET", path: "/plugin/list" }).output(PluginListResultSchema),
  pluginPublish: oc
    .route({ method: "POST", path: "/plugin/publish" })
    .input(PluginPublishOptionsSchema)
    .output(PluginPublishResultSchema),
  publish: oc
    .route({ method: "POST", path: "/publish" })
    .input(PublishOptionsSchema)
    .output(PublishResultSchema),
  keyPublish: oc
    .route({ method: "POST", path: "/key/publish" })
    .input(KeyPublishOptionsSchema)
    .output(KeyPublishResultSchema),
});

export type DevOptions = z.infer<typeof DevOptionsSchema>;
export type StartOptions = z.infer<typeof StartOptionsSchema>;
export type BuildOptions = z.infer<typeof BuildOptionsSchema>;
export type BosConfigResult = z.infer<typeof ConfigResultSchema>;
export type PluginAddOptions = z.infer<typeof PluginAddOptionsSchema>;
export type PluginAddResult = z.infer<typeof PluginAddResultSchema>;
export type PluginRemoveOptions = z.infer<typeof PluginRemoveOptionsSchema>;
export type PluginRemoveResult = z.infer<typeof PluginRemoveResultSchema>;
export type PluginListResult = z.infer<typeof PluginListResultSchema>;
export type PluginPublishOptions = z.infer<typeof PluginPublishOptionsSchema>;
export type PluginPublishResult = z.infer<typeof PluginPublishResultSchema>;
export type PublishOptions = z.infer<typeof PublishOptionsSchema>;
export type KeyPublishOptions = z.infer<typeof KeyPublishOptionsSchema>;
export type KeyPublishResult = z.infer<typeof KeyPublishResultSchema>;
