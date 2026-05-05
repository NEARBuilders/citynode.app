import { z } from "./sdk";

export interface BosConfigInput extends Record<string, unknown> {
  extends?: string;
  account?: string;
  domain?: string;
  testnet?: string;
  template?: string;
  gateway?: {
    development?: string;
    production?: string;
    account?: string;
  };
  development?: string;
  production?: string;
  integrity?: string;
  name?: string;
  version?: string;
  proxy?: string;
  variables?: Record<string, string>;
  secrets?: string[];
  app?: Record<string, Record<string, unknown>>;
  shared?: Record<string, Record<string, Record<string, unknown>>>;
  plugins?: Record<string, BosConfigInput>;
}

export const SourceModeSchema = z.enum(["local", "remote"]);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const SharedConfigSchema = z.object({
  version: z.string(),
  requiredVersion: z.string().optional(),
  singleton: z.boolean().optional(),
  eager: z.boolean().optional(),
  strictVersion: z.boolean().optional(),
  shareScope: z.string().optional(),
});
export type SharedConfig = z.infer<typeof SharedConfigSchema>;
export type SharedDepConfig = SharedConfig;
export const SharedDepConfigSchema = SharedConfigSchema;

export const FederationEntrySchema = z.object({
  name: z.string(),
  url: z.string(),
  entry: z.string(),
  source: SourceModeSchema,
  integrity: z.string().optional(),
});
export type FederationEntry = z.infer<typeof FederationEntrySchema>;

export const ApiPluginConfigSchema = z.object({
  name: z.string(),
  development: z.string().optional(),
  production: z.string().optional(),
  integrity: z.string().optional(),
  proxy: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  secrets: z.array(z.string()).optional(),
});
export type ApiPluginConfig = z.infer<typeof ApiPluginConfigSchema>;

export const BosPluginRefSchema = z.object({
  extends: z.string().optional(),
  development: z.string().optional(),
  production: z.string().optional(),
  integrity: z.string().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  proxy: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  secrets: z.array(z.string()).optional(),
  routes: z.array(z.string()).optional(),
});
export type BosPluginRef = z.infer<typeof BosPluginRefSchema>;

export const RuntimePluginConfigSchema = z.object({
  name: z.string(),
  url: z.string(),
  entry: z.string(),
  source: SourceModeSchema,
  localPath: z.string().optional(),
  port: z.number().optional(),
  proxy: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  secrets: z.array(z.string()).optional(),
  integrity: z.string().optional(),
});
export type RuntimePluginConfig = z.infer<typeof RuntimePluginConfigSchema>;

export const UiConfigSchema = z.object({
  name: z.string(),
  development: z.string().optional(),
  production: z.string().optional(),
  integrity: z.string().optional(),
  ssr: z.string().optional(),
  ssrIntegrity: z.string().optional(),
});
export type UiConfig = z.infer<typeof UiConfigSchema>;

export const HostConfigSchema = z.object({
  development: z.string(),
  production: z.string(),
  integrity: z.string().optional(),
  secrets: z.array(z.string()).optional(),
});
export type HostConfig = z.infer<typeof HostConfigSchema>;

export const ClientRuntimeInfoSchema = z.object({
  accountId: z.string(),
  gatewayId: z.string(),
  runtimeBasePath: z.string(),
  title: z.string().nullable(),
  hostUrl: z.string().nullable(),
});
export type ClientRuntimeInfo = z.infer<typeof ClientRuntimeInfoSchema>;

export const BosStagingSchema = z.object({
  domain: z.string(),
});
export type BosStaging = z.infer<typeof BosStagingSchema>;

export const BosConfigSchema = z.object({
  account: z.string(),
  extends: z.string().optional(),
  domain: z.string().optional(),
  testnet: z.string().optional(),
  staging: BosStagingSchema.optional(),
  repository: z.string().optional(),
  shared: z.record(z.string(), z.record(z.string(), SharedConfigSchema)).optional(),
  plugins: z.record(z.string(), BosPluginRefSchema).optional(),
  app: z.object({
    host: HostConfigSchema,
    ui: UiConfigSchema,
    api: ApiPluginConfigSchema,
    auth: ApiPluginConfigSchema.optional(),
  }),
});
export type BosConfig = z.infer<typeof BosConfigSchema>;

export const RuntimeConfigSchema = z.object({
  env: z.enum(["development", "production"]),
  account: z.string(),
  domain: z.string().optional(),
  networkId: z.enum(["mainnet", "testnet"]),
  title: z.string().optional(),
  repository: z.string().optional(),
  hostUrl: z.string(),
  shared: z
    .object({
      ui: z.record(z.string(), SharedConfigSchema).optional(),
    })
    .optional(),
  ui: FederationEntrySchema.extend({
    localPath: z.string().optional(),
    port: z.number().optional(),
    ssrUrl: z.string().optional(),
    ssrIntegrity: z.string().optional(),
  }),
  api: FederationEntrySchema.extend({
    localPath: z.string().optional(),
    port: z.number().optional(),
    proxy: z.string().optional(),
    variables: z.record(z.string(), z.string()).optional(),
    secrets: z.array(z.string()).optional(),
  }),
  auth: FederationEntrySchema.extend({
    localPath: z.string().optional(),
    port: z.number().optional(),
    proxy: z.string().optional(),
    variables: z.record(z.string(), z.string()).optional(),
    secrets: z.array(z.string()).optional(),
  }).optional(),
  plugins: z.record(z.string(), RuntimePluginConfigSchema).optional(),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const ClientRuntimeConfigSchema = z.object({
  env: z.enum(["development", "production"]),
  account: z.string(),
  networkId: z.enum(["mainnet", "testnet"]),
  hostUrl: z.string().optional(),
  assetsUrl: z.string(),
  apiBase: z.string(),
  rpcBase: z.string(),
  repository: z.string().optional(),
  runtime: ClientRuntimeInfoSchema.optional(),
  ui: z
    .object({
      name: z.string(),
      url: z.string(),
      entry: z.string(),
      integrity: z.string().optional(),
    })
    .optional(),
  api: z
    .object({
      name: z.string(),
      url: z.string(),
      entry: z.string(),
      integrity: z.string().optional(),
    })
    .optional(),
  plugins: z
    .record(
      z.string(),
      z.object({
        name: z.string(),
        url: z.string(),
        entry: z.string(),
        integrity: z.string().optional(),
      }),
    )
    .optional(),
});
export type ClientRuntimeConfig = z.infer<typeof ClientRuntimeConfigSchema>;
