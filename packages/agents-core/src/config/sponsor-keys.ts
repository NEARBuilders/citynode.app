import { KeyPair, type KeyPairString } from "near-api-js";
import { z } from "zod";

/** One balance/budget, multiple independent access-key nonces. No optional/legacy signer. */
export const sponsorKeysSchema = z
  .string()
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({ code: "custom", message: "Sponsor keys must be a JSON array" });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(
        z.strictObject({
          accountId: z
            .string()
            .min(2)
            .max(64)
            .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
            .refine((value) => !value.endsWith(".testnet"), "Account/network mismatch"),
          privateKey: z.string().startsWith("ed25519:"),
        }),
      )
      .min(1)
      .max(32),
  )
  .superRefine((keys, context) => {
    if (new Set(keys.map((key) => key.accountId)).size !== 1)
      context.addIssue({ code: "custom", message: "Sponsor keys must share one account" });
    const publicKeys = new Set<string>();
    for (const [index, key] of keys.entries()) {
      try {
        const publicKey = KeyPair.fromString(key.privateKey as KeyPairString)
          .getPublicKey()
          .toString();
        if (publicKeys.has(publicKey))
          context.addIssue({ code: "custom", path: [index], message: "Duplicate sponsor key" });
        publicKeys.add(publicKey);
      } catch {
        context.addIssue({
          code: "custom",
          path: [index, "privateKey"],
          message: "Invalid sponsor key",
        });
      }
    }
  });
