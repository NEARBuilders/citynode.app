import { sha3_256 } from "@noble/hashes/sha3.js";
import { base64 } from "@scure/base";
import { z } from "zod";
import {
  borshBytes,
  borshInteger,
  borshString,
  borshTimestampNanos,
  borshU32,
  concat,
} from "./borsh.js";
import { nearAccountSchema } from "./common.js";
import { evmWalletRequestMessageSchema } from "./evm-wallet.js";

const decimal = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const transfer = z.strictObject({
  action: z.literal("transfer"),
  payload: z.strictObject({ amount: decimal }),
});
const functionCall = z.strictObject({
  action: z.literal("function_call"),
  payload: z.strictObject({
    function_name: z.string().min(1).max(128),
    args: z.string().max(32768).optional(),
    deposit: decimal.optional(),
    gas: decimal.optional(),
    gas_weight: decimal.optional(),
  }),
});
const walletActionSchema = z.discriminatedUnion("action", [transfer, functionCall]);
const walletRequestSchema = z.strictObject({
  external: z
    .array(
      z.strictObject({
        receiver_id: nearAccountSchema,
        refund_to: nearAccountSchema.optional(),
        actions: z.array(walletActionSchema).min(1).max(8),
      }),
    )
    .min(1)
    .max(4),
});
export const walletRequestMessageSchema = z.strictObject({
  pay_for_gas: z.literal(false).optional(),
  chain_id: z.literal("mainnet"),
  signer_id: nearAccountSchema,
  nonce: z.number().int().nonnegative().max(0xffffffff),
  created_at: z.string().datetime({ offset: false }),
  timeout_secs: z.number().int().positive().max(3600),
  request: walletRequestSchema,
});
const signedWalletRequestSchema = z.strictObject({
  msg: z.union([walletRequestMessageSchema, evmWalletRequestMessageSchema]),
  proof: z.string().min(1).max(16_384),
  idempotencyKey: z.string().min(8).max(128),
});
export type WalletRequestMessage = z.infer<typeof walletRequestMessageSchema>;
export type SignedWalletRequest = z.infer<typeof signedWalletRequestSchema>;

/** Canonical RequestMessage bytes used by the NEP-616 wallet contract. */
export function serializeWalletRequestMessage(input: WalletRequestMessage): Uint8Array {
  const msg = walletRequestMessageSchema.parse(input);
  const nanos = borshTimestampNanos(msg.created_at);
  const promises = msg.request.external.map((promise) =>
    concat(
      borshString(promise.receiver_id),
      promise.refund_to
        ? concat(new Uint8Array([1]), borshString(promise.refund_to))
        : new Uint8Array([0]),
      borshU32(promise.actions.length),
      ...promise.actions.map((action) => {
        if (action.action === "transfer")
          return concat(new Uint8Array([3]), borshInteger(BigInt(action.payload.amount), 16));
        const payload = action.payload;
        const args = payload.args ? base64.decode(payload.args) : new Uint8Array();
        return concat(
          new Uint8Array([2]),
          borshString(payload.function_name),
          borshBytes(args),
          borshInteger(BigInt(payload.deposit ?? "0"), 16),
          borshInteger(BigInt(payload.gas ?? "0"), 8),
          borshInteger(BigInt(payload.gas_weight ?? "1"), 8),
        );
      }),
    ),
  );
  return concat(
    new Uint8Array([0]),
    borshString(msg.chain_id),
    borshString(msg.signer_id),
    borshU32(msg.nonce),
    borshInteger(nanos, 8),
    borshU32(msg.timeout_secs),
    borshU32(0),
    borshU32(promises.length),
    ...promises,
  );
}

export function walletRequestHash(message: WalletRequestMessage): Uint8Array {
  return sha3_256(
    concat(
      new TextEncoder().encode("NEAR_WALLET_CONTRACT/V1"),
      serializeWalletRequestMessage(message),
    ),
  );
}
