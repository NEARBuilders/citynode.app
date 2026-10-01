import { canonical, type OwnerProof, type OwnerWallet } from "@near-intents-agent-api/contracts";
import { ApiError } from "../../shared/errors.js";
import { assertOwnerIdentity, verifyOwnerProof } from "../../shared/owner-proof.js";
import { verifyWalletAuthorization } from "../../shared/wallet-authorization.js";
import { type AgentRecord, advanceOwnerCounter } from "./repository.js";
import { assertOwnerWalletCode } from "./wallet-initialization.js";

export async function verifyBoundOwner(
  agent: AgentRecord,
  message: { owner: OwnerWallet; nonce: string; recipient: string },
  proof: OwnerProof,
) {
  assertOwnerIdentity(agent.ownerIdentity, message.owner);
  if ("walletAuthorization" in proof) {
    if (!agent.ownerAccountId) throw new ApiError("agent_not_bound", 409);
    if (message.owner.type !== "passkey" && message.owner.type !== "evm")
      throw new ApiError("wallet_authorization_invalid", 401);
    const blockId = await assertOwnerWalletCode(message.owner);
    await verifyWalletAuthorization({
      accountId: agent.ownerAccountId,
      authorization: proof.walletAuthorization,
      expectedPayload: canonical(message),
      blockId,
    });
    return {
      verifier: "wallet-authorization.v1",
      blockId,
      ownerAccountId: agent.ownerAccountId,
      owner: message.owner,
    };
  }
  if (message.owner.type === "passkey" || message.owner.type === "evm")
    throw new ApiError("wallet_authorization_required", 401);
  const counter = await verifyOwnerProof({
    owner: message.owner,
    message,
    proof,
    counter: agent.ownerCounter,
  });
  if (counter === 0) return { verifier: "owner-proof.v1", owner: message.owner };
  const updated = await advanceOwnerCounter({
    tenantId: agent.tenantId,
    id: agent.id,
    ownerIdentity: message.owner,
    previousCounter: agent.ownerCounter,
    counter,
  });
  if (!updated) throw new ApiError("owner_counter_conflict", 409);
  return { verifier: "owner-proof.v1", owner: message.owner, counter };
}
