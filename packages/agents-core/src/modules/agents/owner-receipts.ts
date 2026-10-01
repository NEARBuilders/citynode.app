import { canonical, type OwnerProof } from "@near-intents-agent-api/contracts";
import { ownerReceipts, type Tx } from "@near-intents-agent-api/database";
import { sql } from "drizzle-orm";
import { hashSecret } from "../../shared/crypto.js";

/** Called only after proof verification, inside the transaction applying its effect. */
export async function recordOwnerReceipt(
  tx: Tx,
  input: {
    tenantId: string;
    agentId: string;
    action: string;
    targetId: string;
    /** Epoch verified for the effect; kept outside the unmodified signed message. */
    ownerEpoch: number;
    message: { nonce: string };
    proof: OwnerProof;
    verification: unknown;
    original?: unknown;
  },
) {
  const payload = canonical(input.message);
  await tx.insert(ownerReceipts).values({
    id: hashSecret(
      canonical({ tenantId: input.tenantId, agentId: input.agentId, nonce: input.message.nonce }),
    ),
    tenantId: input.tenantId,
    agentId: input.agentId,
    action: input.action,
    targetId: input.targetId,
    ownerEpoch: input.ownerEpoch,
    nonce: input.message.nonce,
    payloadHash: hashSecret(payload),
    message: input.message,
    proof: input.proof,
    original: input.original ?? null,
    verification: input.verification,
    decidedAt: sql`clock_timestamp()`,
  });
}
