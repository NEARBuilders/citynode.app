import { loadConfig } from "everything-dev/config";
import type { ClientRuntimeConfig } from "everything-dev/types";
import type { RenderOptionsWithApi, RouterContext } from "everything-dev/ui/types";
import type { RuntimeConfig } from "@/types";
import type { ApiClient } from "../../../ui/src/lib/api-client";

export async function loadTestRuntimeConfig(): Promise<RuntimeConfig> {
  const result = await loadConfig();

  if (!result) {
    throw new Error("No bos.config.json found for host tests");
  }

  const config = result.runtime;
  const uiUrl = process.env.BOS_UI_URL;
  const uiSsrUrl = process.env.BOS_UI_SSR_URL ?? uiUrl;

  if (uiUrl) config.ui.url = uiUrl;
  if (uiSsrUrl) config.ui.ssrUrl = uiSsrUrl;

  return config;
}

export function buildTestClientRuntimeConfig(config: RuntimeConfig): Partial<ClientRuntimeConfig> {
  const plugins: NonNullable<Partial<ClientRuntimeConfig>["plugins"]> = {};

  for (const [key, plugin] of Object.entries(config.plugins ?? {}) as Array<
    [string, { name: string; url: string; entry: string }]
  >) {
    plugins[key] = {
      name: plugin.name,
      url: plugin.url,
      entry: plugin.entry,
    };
  }

  return {
    env: config.env,
    account: config.account,
    networkId: config.networkId,
    hostUrl: config.host?.url,
    assetsUrl: config.ui.url,
    apiBase: "/api",
    rpcBase: "/api/rpc",
    ui: {
      name: config.ui.name,
      url: config.ui.url,
      entry: config.ui.entry,
    },
    api: {
      name: config.api.name,
      url: config.api.url,
      entry: config.api.entry,
    },
    plugins: Object.keys(plugins).length > 0 ? plugins : undefined,
  };
}

export function buildTestRouteHeadContext(config: RuntimeConfig): Partial<RouterContext> {
  return {
    assetsUrl: config.ui.url,
    runtimeConfig: buildTestClientRuntimeConfig(config),
  };
}

export function buildTestRenderOptions(
  config: RuntimeConfig,
  apiClient: ApiClient,
): RenderOptionsWithApi<ApiClient> {
  return {
    assetsUrl: config.ui.url,
    runtimeConfig: buildTestClientRuntimeConfig(config),
    apiClient,
  };
}
