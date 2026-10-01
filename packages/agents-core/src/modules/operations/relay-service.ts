import type { RelayInput } from "@near-intents-agent-api/relayer/schema";
import { PublicKey } from "near-api-js";
import { requireRelayer } from "../../lib/relayer.js";
import { sponsorIdentity } from "../../lib/sponsor-pool.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import { requireBoundAgent } from "../agents/service.js";
import { commitDispatch } from "./dispatch-fence.js";
import { recordDispatchEvidence } from "./repository.js";
import { runOperation } from "./service.js";
import { commitSponsorship, releaseSponsorship, reserveSponsorship } from "./sponsor-budget.js";

/**
 * Owner-signed NEP-366 delegate submission. The relayer verifies receiver allowlist,
 * owner key and signature; it grants no spending authority.
 *
 * The sponsor pays gas, so every relay holds a daily sponsor-budget reservation. The slot is
 * committed inside the pre-broadcast callback, after the dispatch commitment. The relayer broadcasts only
 * once that callback resolves, so a failure before commit proves nothing reached the chain and is
 * the only case that refunds the slot.
 */
export async function relayTransaction(actor: Actor, agentId: string, input: RelayInput) {
  const { agent } = await requireBoundAgent(actor, agentId);
  const submit = requireRelayer();
  if (!agent.ownerPublicKey) throw new ApiError("relay_requires_near_owner");
  if (input.senderId !== agent.ownerAccountId) throw new ApiError("relay_owner_mismatch", 403);
  const ownerPublicKeyHex = Buffer.from(PublicKey.from(agent.ownerPublicKey).data).toString("hex");
  return runOperation({
    actor,
    agentId,
    kind: "relay",
    action: "relay",
    idempotencyKey: input.idempotencyKey,
    request: input,
    authorizationEpochs: {
      ownerEpoch: agent.ownerEpoch,
      policyEpoch: agent.policyEpoch,
      lifecycleEpoch: agent.lifecycleEpoch,
    },
    run: async (operationId) => {
      await reserveSponsorship(actor.tenantId, agentId, operationId);
      let committed = false;
      let signingIdentity: ReturnType<typeof sponsorIdentity>;
      try {
        const result = await submit(input, ownerPublicKeyHex, async (transactionHash) => {
          signingIdentity = sponsorIdentity();
          await commitDispatch(actor.tenantId, agentId, operationId);
          // The signed hash is known before broadcast; persisting it first leaves no window in
          // which a broadcast transaction has no recorded identity.
          await recordDispatchEvidence(
            actor.tenantId,
            agentId,
            operationId,
            "relay",
            { transactionHash, ...signingIdentity },
            transactionHash,
          );
          await commitSponsorship(operationId);
          committed = true;
          sponsorIdentity(); // Recheck the lease after the awaited dispatch writes.
        });
        // A relayer that resolved without running the callback may have broadcast unfenced.
        if (!committed) await commitSponsorship(operationId);
        return result && typeof result === "object" ? { ...result, ...signingIdentity } : result;
      } catch (error) {
        if (!committed)
          await releaseSponsorship(actor.tenantId, agentId, operationId).catch(() => {
            // A failed refund leaves the slot charged, which only over-counts sponsor spend.
            logger.warn("sponsor_release_failed", { operation_id: operationId });
          });
        throw error;
      }
    },
  });
}
