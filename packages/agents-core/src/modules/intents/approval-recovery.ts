import { approvalDetailSchema } from "@near-intents-agent-api/contracts";
import { ownerIntents, type Tx } from "@near-intents-agent-api/database";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getOutlayer } from "../../lib/outlayer.js";
import { hashSecret } from "../../shared/crypto.js";
import type { ApprovalVoteEvidence } from "../wallet/approval-service.js";
import { commitOwnerIntent } from "./commit-service.js";
import type { OwnerIntentRecord } from "./repository.js";

const acceptedVoteSchema = z.object({
  family: z.literal("approval"),
  approvalId: z.string(),
  verdict: z.enum(["approve", "reject"]),
  requestHash: z.string(),
  evidence: z.object({
    walletId: z.string(),
    walletPublicKey: z.string(),
    signatureHash: z.string(),
  }),
});

/** Store only a fingerprint, atomically with acceptance and nonce consumption. */
export async function acceptApprovalVote(
  tx: Tx,
  row: OwnerIntentRecord,
  evidence: ApprovalVoteEvidence,
) {
  await commitOwnerIntent(tx, row.tenantId, row.id, null, "submitted");
  await tx
    .update(ownerIntents)
    .set({ context: { ...z.record(z.string(), z.unknown()).parse(row.context), evidence } })
    .where(and(eq(ownerIntents.tenantId, row.tenantId), eq(ownerIntents.id, row.id)));
}

/** Read-only reconciliation: a recorded vote is not proof its underlying action executed. */
export async function recoverApprovalVote(row: OwnerIntentRecord) {
  const parsed = acceptedVoteSchema.safeParse(row.context);
  if (row.state !== "submitted" || !parsed.success) return null;
  const context = parsed.data;
  // The public contract documents collected approvals, not rejection receipts.
  if (context.verdict !== "approve") return null;
  const signer = row.signer;
  if (signer.type !== "near") return null;
  try {
    // This endpoint is public; recovery must survive wallet deletion or key revocation.
    const approval = approvalDetailSchema.parse(
      await getOutlayer().approval("", context.approvalId),
    );
    if (
      approval.id !== context.approvalId ||
      approval.wallet_id !== context.evidence.walletId ||
      approval.wallet_pubkey !== context.evidence.walletPublicKey ||
      approval.request_hash !== context.requestHash ||
      !approval.approvers?.some(
        (receipt) =>
          receipt.approver_id === signer.accountId &&
          hashSecret(receipt.signature) === context.evidence.signatureHash,
      )
    )
      return null;
    return { approvalId: context.approvalId, verdict: context.verdict };
  } catch {
    // Unavailable, malformed or missing evidence is never a terminal outcome.
    return null;
  }
}
