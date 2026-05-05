import type { AnyContractRouter, ContractRouterClient } from "@orpc/contract";
import type { ContractType as authContract } from "../../auth/src/contract.ts";

type ClientFactory<C extends AnyContractRouter> = (
  context?: Record<string, unknown>,
) => ContractRouterClient<C>;

export type PluginsClient = {
  auth: ClientFactory<authContract>;
};
