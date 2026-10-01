import type { ContractRouterClient } from "@orpc/contract";
import {
  type ClientServiceConfig,
  createPluginApiClient as createFrameworkPluginClient,
} from "everything-dev/ui/api";
import type { ContractType } from "../../src/contract";

export type AgentsContract = ContractType;
export type AgentsClient = ContractRouterClient<AgentsContract>;

export function createAgentsClient(config: ClientServiceConfig): AgentsClient {
  return createFrameworkPluginClient<AgentsContract>("agents", config);
}

/**
 * A grant-scoped agents client: each token gets its own instance carrying
 * the `x-grant-token` header on every call.
 */
export function createGrantScopedAgentsClient(
  config: ClientServiceConfig,
  token: string,
): AgentsClient {
  return createFrameworkPluginClient<AgentsContract>(
    "agents",
    config,
    new Headers({ "x-grant-token": token }),
  );
}
