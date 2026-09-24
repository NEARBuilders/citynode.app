import { Config, Context, type Effect } from "effect";
import type {
  ClientRuntimeConfig,
  RuntimeConfig,
  SharedConfig,
  SourceMode,
} from "everything-dev/types";
import type { ComposePayload } from "everything-dev/ui/manifest";
import type { RuntimePlugin } from "../types";
import { normalizeUrl } from "../utils/normalize";

export type { ClientRuntimeConfig, RuntimeConfig, SharedConfig, SourceMode };

export class ConfigService extends Context.Service<ConfigService, RuntimeConfig>()(
  "host/ConfigService",
) {}

export function readCorsOrigins(): Effect.Effect<string[], Config.ConfigError> {
  return Config.string("CORS_ORIGIN").pipe(
    Config.withDefault(""),
    Config.map((value) =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

export type ActiveRuntimeState = NonNullable<ClientRuntimeConfig["runtime"]>;

export type RuntimeClientConfig = ClientRuntimeConfig & { runtime?: ActiveRuntimeState };

function getFallbackGatewayId(config: RuntimeConfig) {
  if (config.domain) {
    return config.domain;
  }
  return normalizeUrl(config.host?.url)?.replace(/^https?:\/\//, "") ?? "runtime";
}

const LOOPBACK_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1)$/i;
const LOOPBACK_DOMAIN_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

/**
 * Browser-facing asset URLs (ADR 0011): the image-native runtime loads its
 * remotes through container-local static servers, which a public browser can
 * never reach — those loopback origins must not leak into served HTML. When
 * the bundle directory is staged (BOS_BUNDLE_DIR), rewrite loopback origins
 * to the canonical same-origin /bundles/<account>/<gateway>/<slot>/ base the
 * host serves from the same staged artifacts. Dev stacks (no BOS_BUNDLE_DIR)
 * keep their verbatim URLs. Returns the rewritten base, or null when the
 * URL is not a loopback origin (caller keeps the source URL).
 */
function clientBundleBase(url: string, slot: string, config: RuntimeConfig): string | null {
  if (!process.env.BOS_BUNDLE_DIR || !config.domain || !config.account) {
    return null;
  }
  if (LOOPBACK_DOMAIN_PATTERN.test(config.domain)) {
    return null;
  }
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  const origin = new URL(url).origin;
  if (!LOOPBACK_HOSTNAME_PATTERN.test(new URL(origin).hostname)) {
    return null;
  }
  return `https://${config.domain}/bundles/${config.account}/${config.domain}/${slot}`;
}

/** Bundle slot for a plugin UI key — the auth app-slot stages its folder-form
 * ui under "auth-ui" (its workspace dist is the plugin itself). */
const clientUiSlot = (key: string) => (key === "auth" ? "auth-ui" : key);

function rewriteComposePayload(
  composePayload: ComposePayload,
  config: RuntimeConfig,
): ComposePayload {
  const remotes = composePayload.remotes.map((remote) => {
    const stripped = remote.entry.replace(/\/remoteEntry\.js$/, "");
    if (stripped === remote.entry) {
      return remote;
    }
    const base = clientBundleBase(stripped, clientUiSlot(remote.key), config);
    return base ? { ...remote, entry: `${base}/remoteEntry.js` } : remote;
  });
  return { ...composePayload, remotes };
}

export function resolveActiveRuntime(config: RuntimeConfig, request: Request) {
  const url = new URL(request.url);
  const fallbackGatewayId = getFallbackGatewayId(config);
  return {
    accountId: config.account,
    gatewayId: fallbackGatewayId,
    runtimeBasePath: "/",
    title: config.title ?? config.account,
    description: config.description ?? null,
    hostUrl: url.origin,
  } satisfies ActiveRuntimeState;
}

export function buildRuntimeClientConfig(
  config: RuntimeConfig,
  request: Request,
  activeRuntime: ActiveRuntimeState,
  authAvailable: boolean,
  composePayload?: ComposePayload,
): RuntimeClientConfig {
  const requestUrl = new URL(request.url);
  const uiConfig = config.ui;

  if (!uiConfig) {
    throw new Error("UI config is required to build the runtime client config");
  }

  const clientUiBase = clientBundleBase(uiConfig.url, "ui", config);
  const clientUiUrl = clientUiBase ?? uiConfig.url;

  return {
    env: config.env,
    account: activeRuntime.accountId,
    networkId: config.account.endsWith(".testnet") ? "testnet" : "mainnet",
    hostUrl: requestUrl.origin,
    assetsUrl: clientUiUrl,
    apiBase: "/api",
    rpcBase: "/api/rpc",
    authAvailable,
    repository: config.repository,
    ui: {
      name: uiConfig.name,
      url: clientUiUrl,
      entry: clientUiBase ? `${clientUiBase}/mf-manifest.json` : uiConfig.entry,
      integrity: uiConfig.integrity,
      compose: composePayload ? rewriteComposePayload(composePayload, config) : undefined,
    },
    api: config.api
      ? (() => {
          const base = clientBundleBase(config.api.url, "api", config);
          return {
            name: config.api.name,
            url: base ?? config.api.url,
            entry: base ? `${base}/mf-manifest.json` : config.api.entry,
            integrity: config.api.integrity,
            ...(config.api.variables ? { variables: config.api.variables } : {}),
          };
        })()
      : undefined,
    auth: config.auth
      ? (() => {
          const base = clientBundleBase(config.auth.url, "auth", config);
          return {
            name: config.auth.name,
            url: base ?? config.auth.url,
            entry: base ? `${base}/mf-manifest.json` : config.auth.entry,
            integrity: config.auth.integrity,
            ...(config.auth.variables ? { variables: config.auth.variables } : {}),
          };
        })()
      : undefined,
    plugins: Object.fromEntries(
      (Object.entries(config.plugins ?? {}) as Array<[string, RuntimePlugin]>).map(
        ([key, plugin]) => {
          const slot = clientUiSlot(key);
          const base = clientBundleBase(plugin.url, slot, config);
          const pluginUiBase = plugin.ui ? clientBundleBase(plugin.ui.url, slot, config) : null;
          return [
            key,
            {
              name: plugin.name,
              url: base ?? plugin.url,
              entry: base ? `${base}/mf-manifest.json` : plugin.entry,
              integrity: plugin.integrity,
              ...(plugin.variables ? { variables: plugin.variables } : {}),
              ...(plugin.ui
                ? {
                    ui: {
                      name: plugin.ui.name,
                      url: pluginUiBase ?? plugin.ui.url,
                      entry: pluginUiBase ? `${pluginUiBase}/mf-manifest.json` : plugin.ui.entry,
                      source: plugin.ui.source,
                      integrity: plugin.ui.integrity,
                      ssrUrl: plugin.ui.ssrUrl,
                      ssrIntegrity: plugin.ui.ssrIntegrity,
                    },
                  }
                : {}),
            },
          ];
        },
      ),
    ),
    runtime: activeRuntime,
  } as RuntimeClientConfig;
}
