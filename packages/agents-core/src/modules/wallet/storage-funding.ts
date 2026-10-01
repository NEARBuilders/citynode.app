import { z } from "zod";

/**
 * Policy storage funding: a plain sponsor transfer to the owner account that precedes the policy
 * relay, as a separate transaction with its own outcome.
 *
 * It is journaled with its signed hash and nonce before it can be broadcast, so a transfer whose
 * finality was never observed stays on record for reconciliation instead of disappearing with the
 * error. `submitted` means "may have been paid", never "paid": only `succeeded` waives funding for
 * a later relay of the same preparation, and an unresolved transfer blocks the policy phase from
 * being closed as if nothing happened.
 */
export const storageFundingSchema = z.object({
  status: z.enum(["submitted", "succeeded", "failed"]),
  transaction_hash: z.string().max(128),
  sponsor_account_id: z.string().min(2).max(64),
  sponsor_public_key: z.string().max(128).optional(),
  sponsor_nonce: z
    .string()
    .regex(/^[0-9]{1,20}$/)
    .optional(),
  receiver_id: z.string().max(64),
  amount_yocto: z.string().regex(/^[0-9]{1,40}$/),
});

export type StorageFunding = z.infer<typeof storageFundingSchema>;

/** The funding journaled in a stored policy operation result, if any. */
export function storedFunding(result: unknown): StorageFunding | undefined {
  const parsed = storageFundingSchema.safeParse(
    (result as { storage_funding?: unknown } | null)?.storage_funding,
  );
  return parsed.success ? parsed.data : undefined;
}
