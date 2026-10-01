import { z } from "zod";
import { nearAccountSchema } from "./common.js";

const decimal = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const evmWalletActionSchema = z.strictObject({
  action: z.literal("function_call"),
  function_name: z.string().min(1).max(128),
  args: z.string().max(32768),
  deposit: decimal,
  min_gas: decimal.optional(),
});
export const evmWalletRequestMessageSchema = z.strictObject({
  chain_id: z.literal("mainnet"),
  signer_id: nearAccountSchema,
  nonce: z.number().int().nonnegative().max(0xffffffff),
  created_at: z.string().datetime({ offset: false }),
  timeout_secs: z.number().int().positive().max(3600),
  request: z.strictObject({
    ops: z.tuple([]),
    out: z.strictObject({
      after: z.tuple([]),
      // biome-ignore lint/suspicious/noThenProperty: Required wallet-contract request field.
      then: z
        .array(
          z.strictObject({
            receiver_id: nearAccountSchema,
            actions: z.array(evmWalletActionSchema).min(1).max(8),
          }),
        )
        .min(1)
        .max(4),
    }),
  }),
});
export type EvmWalletRequestMessage = z.infer<typeof evmWalletRequestMessageSchema>;

export function evmAuthorizationTypedData(message: {
  purpose: string;
  recipient: string;
  payload: string;
}) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      Authorization: [
        { name: "purpose", type: "string" },
        { name: "recipient", type: "string" },
        { name: "payload", type: "string" },
      ],
    },
    primaryType: "Authorization",
    domain: { name: "NEAR Wallet Contract", version: "1" },
    message,
  };
}

export function evmWalletTypedData(msg: EvmWalletRequestMessage) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      WalletMessage: [
        { name: "chainId", type: "string" },
        { name: "signerId", type: "string" },
        { name: "nonce", type: "uint32" },
        { name: "createdAt", type: "string" },
        { name: "timeoutSecs", type: "uint32" },
        { name: "ops", type: "string" },
        { name: "out", type: "string" },
      ],
    },
    primaryType: "WalletMessage",
    domain: { name: "NEAR Wallet Contract", version: "1" },
    message: {
      chainId: msg.chain_id,
      signerId: msg.signer_id,
      nonce: msg.nonce,
      createdAt: msg.created_at,
      timeoutSecs: msg.timeout_secs,
      ops: JSON.stringify(msg.request.ops),
      out: JSON.stringify(msg.request.out),
    },
  };
}
