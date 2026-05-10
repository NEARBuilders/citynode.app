/**
 * Public UI surface — thin barrel only.
 *
 * This file re-exports everything that UI route code needs.
 * Do not create clients, add app logic, or define types here.
 *
 * Framework file roles (understand this boundary — don't dig into host):
 *
 *   hydrate.tsx       — Client bootstrap. Creates browser-side QueryClient,
 *                        Router, and browser-side auth/API clients once.
 *                        Called from the host-rendered HTML shell.
 *
 *   router.tsx        — Client router factory. Consumes the context set up
 *                        during hydration. Uses browser history.
 *
 *   router.server.tsx — SSR router factory. Creates request-scoped server
 *                        router and server-side API/auth clients per request.
 *                        Mirrors client router shape for hydration consistency.
 *
 *   routes/__root.tsx — HTML shell, head/scripts/styles, runtime config
 *                        handoff. Root boundary between host-rendered
 *                        document and the UI application.
 *
 *   app.ts            — This file. Re-exports runtime helpers from
 *                        everything-dev/ui/runtime and public client surfaces
 *                        from ./lib/api and ./lib/auth. Also re-exports
 *                        router-facing public types.
 *
 * Boundary rule: The host loads UI remotely via Module Federation and
 * provides runtime config + auth/API routing. Work within the typed
 * surface exported here. Only investigate host internals if something
 * is genuinely broken and a host PR is warranted.
 */

export { getBaseStyles } from "everything-dev/ui/head";

import {
  buildPublishedAccountHref,
  buildPublishedGatewayHref,
  buildRuntimeHref,
  getAccount,
  getActiveRuntime,
  getApiBaseUrl,
  getAssetsUrl,
  getHostUrl,
  getNetworkId,
  getRepository,
  getRuntimeBasePath,
  getRuntimeConfig,
} from "everything-dev/ui/runtime";

export {
  buildPublishedAccountHref,
  buildPublishedGatewayHref,
  buildRuntimeHref,
  getAccount,
  getActiveRuntime,
  getApiBaseUrl,
  getAssetsUrl,
  getHostUrl,
  getNetworkId,
  getRepository,
  getRuntimeBasePath,
  getRuntimeConfig,
};

import type { ApiClient } from "./lib/api";
import type { AuthClient as AuthClientType } from "./lib/auth";

export type { ApiClient } from "./lib/api";
export { createApiClient, useApiClient } from "./lib/api";
export type { AuthClient, Organization, Passkey, SessionData } from "./lib/auth";
export { createAuthClient, sessionQueryOptions, useAuthClient } from "./lib/auth";

export function getAppName(config?: Parameters<typeof getAccount>[0]): string {
  return getActiveRuntime(config)?.title ?? getAccount(config);
}

import type {
  CreateRouterOptions as BaseCreateRouterOptions,
  RenderOptions as BaseRenderOptions,
  RouterContextWithApi as BaseRouterContextWithApi,
} from "everything-dev/ui/types";
import type { SessionData } from "./lib/auth";

export type {
  ClientRuntimeConfig,
  ClientRuntimeInfo,
} from "everything-dev/types";
export type {
  HeadData,
  HeadLink,
  HeadMeta,
  HeadScript,
  RenderResult,
  RouterModule,
} from "everything-dev/ui/types";

export interface RouterContext extends BaseRouterContextWithApi<ApiClient, SessionData> {
  apiClient: ApiClient;
  authClient: AuthClientType;
}

export interface CreateRouterOptions
  extends Omit<BaseCreateRouterOptions<ApiClient, SessionData>, "context"> {
  context: RouterContext;
}

export interface RenderOptions extends Omit<BaseRenderOptions<SessionData>, "runtimeConfig"> {
  runtimeConfig: BaseRenderOptions<SessionData>["runtimeConfig"];
  apiClient: ApiClient;
}
