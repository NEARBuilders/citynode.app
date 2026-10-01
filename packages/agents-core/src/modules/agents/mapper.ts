import { type AgentView, ownerWalletSchema, walletSchema } from "@near-intents-agent-api/contracts";
import { projectEvmAddress } from "../wallet/service.js";
import type { AgentRecord } from "./repository.js";

export function toAgentDto(
  agent: AgentRecord,
  wallet:
    | { providerWalletId: string; nearAccountId: string; evmAddress: string; status: string }
    | undefined,
): AgentView {
  const ownerWallet = agent.ownerIdentity ? ownerWalletSchema.parse(agent.ownerIdentity) : null;
  return {
    id: agent.id,
    name: agent.name,
    externalUserId: agent.externalUserId,
    status: agent.lifecycle,
    archived: agent.lifecycle === "archived",
    deleted: agent.lifecycle === "deleted",
    ownerWallet,
    ownerNear: agent.ownerNear,
    wallet:
      wallet?.status === "active"
        ? walletSchema.parse({
            wallet_id: wallet.providerWalletId,
            near_account_id: wallet.nearAccountId,
            evm_address: projectEvmAddress(wallet.evmAddress),
          })
        : null,
    createdAt: agent.createdAt.toISOString(),
  };
}
