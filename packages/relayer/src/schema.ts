import { z } from "zod";

const amount = z.string().regex(/^(0|[1-9][0-9]{0,19})$/);

export const relaySchema = z.strictObject({
  senderId: z.string().min(2).max(64),
  receiverId: z.string().min(2).max(64),
  publicKey: z.string().startsWith("ed25519:").max(80),
  nonce: amount,
  maxBlockHeight: amount,
  signatureHex: z.string().regex(/^[0-9a-f]{128}$/),
  actions: z
    .array(
      z.strictObject({
        methodName: z.string().min(1).max(128),
        argsBase64: z
          .string()
          .max(32768)
          .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        gas: amount,
        depositYocto: z.literal("0"),
      }),
    )
    .min(1)
    .max(8),
  idempotencyKey: z.string().min(8).max(128),
});

export type RelayInput = z.infer<typeof relaySchema>;

export type RelayResult = { transactionHash: string; finalExecutionStatus: string };
