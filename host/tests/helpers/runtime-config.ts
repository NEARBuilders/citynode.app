import { loadConfig } from "everything-dev/config";
import type { ClientRuntimeConfig } from "everything-dev/types";
import type { RenderOptionsWithApi, RouterContext } from "everything-dev/ui/types";
import type { RuntimeConfig } from "@/types";
import type { ApiClient } from "../../../ui/src/lib/api";
import type { AuthClient } from "../../../ui/src/lib/auth";

export async function loadTestRuntimeConfig(): Promise<RuntimeConfig> {
  const result = await loadConfig();

  if (!result) {
    throw new Error("No bos.config.json found for host tests");
  }

  const config = result.runtime;
  const rawUi = result.config.app.ui;

  if (!config.ui.url && rawUi.production) {
    config.ui.url = rawUi.production.replace(/\/$/, "");
  }
  if (!config.ui.ssrUrl && rawUi.ssr) {
    config.ui.ssrUrl = rawUi.ssr.replace(/\/$/, "");
  }

  return config;
}

export function createMockAuthClient(): AuthClient {
  return {
    getSession: () => Promise.resolve({ data: null, error: null }),
    useSession: () => ({ data: null, error: null }),
    signIn: Object.assign(() => Promise.resolve({ data: null, error: null }), {
      near: Object.assign(() => Promise.resolve({ data: null, error: null }), {
        nonce: () => Promise.resolve({ data: null, error: null }),
        verify: () => Promise.resolve({ data: null, error: null }),
      }),
      email: Object.assign(() => Promise.resolve({ data: null, error: null }), {
        verification: { sendEmail: () => Promise.resolve({ data: null, error: null }) },
      }),
      password: Object.assign(() => Promise.resolve({ data: null, error: null }), {
        signUp: () => Promise.resolve({ data: null, error: null }),
      }),
      anonymous: Object.assign(() => Promise.resolve({ data: null, error: null }), {
        linkAccount: () => Promise.resolve({ data: null, error: null }),
      }),
      passkey: Object.assign(() => Promise.resolve({ data: null, error: null }), {
        storeRegistrar: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    signUp: Object.assign(() => Promise.resolve({ data: null, error: null }), {
      email: () => Promise.resolve({ data: null, error: null }),
    }),
    signOut: () => Promise.resolve({ data: null, error: null }),
    getHeaders: () => ({}),
    $_fetch: () => Promise.resolve(null),
    $Infer: {
      Session: null as any,
      Account: null as any,
    },
    admin: Object.assign({}, { banUser: () => Promise.resolve({ data: null, error: null }) }),
    organization: Object.assign(
      {},
      {
        list: () => Promise.resolve({ data: null, error: null }),
        create: () => Promise.resolve({ data: null, error: null }),
        setActive: () => Promise.resolve({ data: null, error: null }),
        invite: () => Promise.resolve({ data: null, error: null }),
        getFullOrganization: () => Promise.resolve({ data: null, error: null }),
      },
    ),
    near: Object.assign(
      {},
      {
        profile: Object.assign(
          {},
          {
            get: () => Promise.resolve({ data: null, error: null }),
          },
        ),
        relay: Object.assign(
          {},
          {
            prepare: () => Promise.resolve({ data: null, error: null }),
          },
        ),
        relayHistory: () => Promise.resolve({ data: null, error: null }),
      },
    ),
    passkey: Object.assign(
      {},
      {
        listUserPasskeys: () => Promise.resolve({ data: null, error: null }),
      },
    ),
    apiKey: Object.assign(
      {},
      {
        list: () => Promise.resolve({ data: null, error: null }),
        create: () => Promise.resolve({ data: null, error: null }),
      },
    ),
    phoneNumber: Object.assign(
      {},
      {
        sendVerification: () => Promise.resolve({ data: null, error: null }),
      },
    ),
  } as unknown as AuthClient;
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
    repository: config.repository,
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
  authClient?: AuthClient,
): RenderOptionsWithApi<ApiClient> {
  return {
    assetsUrl: config.ui.url,
    runtimeConfig: buildTestClientRuntimeConfig(config),
    apiClient,
    session: null,
    authClient,
  } as RenderOptionsWithApi<ApiClient>;
}
