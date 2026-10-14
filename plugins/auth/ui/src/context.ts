import type { ContractType } from "@everything-dev/auth-plugin/contract";
import type { ApiClient as HostApiClient } from "everything-dev/ui/api";
import type { AuthClient, SessionData } from "everything-dev/ui/auth";
import type { RouterContextWithApi } from "everything-dev/ui/types";

/** The host's API client, typed by this plugin's contract where the host mounts it. */
export type ApiClient = HostApiClient<{ auth: ContractType }>;

export type { AuthClient, SessionData };

/**
 * Router context the grafted routes run under — structurally the core
 * router's context, provided by the host's core tree at compose time.
 */
export interface RouterContext extends RouterContextWithApi<ApiClient, SessionData> {
  apiClient: ApiClient;
  authClient: AuthClient;
}
