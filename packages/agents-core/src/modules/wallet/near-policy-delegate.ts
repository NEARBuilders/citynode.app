import { createHash } from "node:crypto";
import { nearPolicyRequestSchema, type PolicyDelegate } from "@near-intents-agent-api/contracts";
import { base58 } from "@scure/base";
import { deserialize } from "borsh";
import { encodeDelegateAction, PublicKey, SCHEMA } from "near-api-js";
import { ApiError } from "../../shared/errors.js";

type Decoded = {
  delegateAction: {
    senderId: string;
    receiverId: string;
    nonce: bigint;
    maxBlockHeight: bigint;
    publicKey: { ed25519Key?: { data: number[] } };
    actions: Array<{
      functionCall?: {
        methodName: string;
        args: number[];
        gas: bigint;
        deposit: bigint;
      };
    }>;
  };
  signature: { ed25519Signature?: { data: number[] } };
};

/** Decode wallet-signed NEP-366 bytes; compare every action with prepared policy request. */
export function parseNearPolicyDelegate(input: {
  signedDelegate: string;
  ownerAccountId: string;
  ownerPublicKey: string;
  prepared: unknown;
}): { delegate: PolicyDelegate; signatureHex: string } {
  if (Buffer.from(input.signedDelegate, "base64").toString("base64") !== input.signedDelegate)
    throw new ApiError("policy_delegate_invalid", 400);
  let decoded: Decoded;
  try {
    decoded = deserialize(
      SCHEMA.SignedDelegate,
      Buffer.from(input.signedDelegate, "base64"),
    ) as Decoded;
  } catch {
    throw new ApiError("policy_delegate_invalid", 400);
  }
  const action = decoded.delegateAction;
  const key = action.publicKey.ed25519Key?.data;
  const signature = decoded.signature.ed25519Signature?.data;
  if (
    key?.length !== 32 ||
    !signature ||
    signature.length !== 64 ||
    action.senderId !== input.ownerAccountId ||
    `ed25519:${base58.encode(Uint8Array.from(key))}` !== input.ownerPublicKey
  )
    throw new ApiError("policy_delegate_owner_mismatch", 403);
  const digest = createHash("sha256")
    .update(encodeDelegateAction(action as Parameters<typeof encodeDelegateAction>[0]))
    .digest();
  if (!PublicKey.from(input.ownerPublicKey).verify(digest, Uint8Array.from(signature)))
    throw new ApiError("policy_delegate_signature_invalid", 401);
  const prepared = nearPolicyRequestSchema.parse(input.prepared);
  const delegate: PolicyDelegate = {
    senderId: action.senderId,
    receiverId: action.receiverId,
    publicKey: PublicKey.from(input.ownerPublicKey).toString(),
    nonce: action.nonce.toString(),
    maxBlockHeight: action.maxBlockHeight.toString(),
    actions: action.actions.map((entry) => {
      const call = entry.functionCall;
      if (!call) throw new ApiError("policy_delegate_action_invalid", 400);
      return {
        methodName: call.methodName as PolicyDelegate["actions"][number]["methodName"],
        argsBase64: Buffer.from(call.args).toString("base64"),
        gas: call.gas.toString(),
        depositYocto: call.deposit.toString(),
      };
    }),
  };
  if (
    action.receiverId !== prepared.receiver_id ||
    JSON.stringify(delegate.actions) !== JSON.stringify(prepared.actions)
  )
    throw new ApiError("policy_delegate_action_mismatch", 409);
  return { delegate, signatureHex: Buffer.from(signature).toString("hex") };
}
