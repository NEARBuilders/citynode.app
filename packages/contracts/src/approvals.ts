import { z } from "zod";
import { idSchema, nearAccountSchema, nearPublicKeySchema } from "./common.js";

const approvalVerdictSchema = z.strictObject({ verdict: z.enum(["approve", "reject"]) });
const approvalVoteSchema = approvalVerdictSchema.extend({
  account_id: nearAccountSchema,
  public_key: nearPublicKeySchema,
  signature: z.string().regex(/^[0-9a-f]{128}$/),
  nonce: idSchema,
  request_hash: z.string().min(1).max(128),
});
export const approvalDetailSchema = z.object({
  id: z.uuid(),
  wallet_id: z.string().min(1),
  wallet_pubkey: z.string().min(1),
  request_hash: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  request_type: z.string(),
  request_data: z.record(z.string(), z.unknown()),
  op: z.record(z.string(), z.unknown()).nullable().optional(),
  required_approvals: z.number().int().positive(),
  // Public provider receipts. Older responses may omit them; absence proves nothing.
  approvers: z
    .array(
      z.object({
        approver_id: z.string(),
        approver_role: z.string(),
        signature: z.string(),
        created_at: z.string(),
      }),
    )
    .optional(),
  expires_at: z.string(),
});
export type ApprovalVote = z.infer<typeof approvalVoteSchema>;
export type ApprovalDetail = z.infer<typeof approvalDetailSchema>;
