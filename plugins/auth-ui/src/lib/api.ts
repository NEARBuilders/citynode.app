/**
 * The plugin ui's api-client seam — the auth contract binds once here (the
 * generated contract of the published auth server; the server side is not
 * workspace-local), so routes import the typed client from @/lib/api instead
 * of walking into server sources.
 */

import type { ContractRouterClient } from "@orpc/contract";
import type { ContractType } from "../../../../.bos/generated/auth/contract.d.ts";

export type AuthApiClient = ContractRouterClient<ContractType>;
