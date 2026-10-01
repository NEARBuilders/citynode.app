import { createHash } from "node:crypto";
import {
  actions,
  encodeDelegateAction,
  type KeyPairString,
  PublicKey,
  Signature,
} from "near-api-js";
import { transactionSucceeded } from "./confirmation.js";
import { RelayError } from "./errors.js";
import { awaitFinalTransaction, type NonceWitness } from "./finality.js";
import { createNearRpcProvider } from "./near-rpc.js";
import { sendOperationalTransaction, signOperationalTransaction } from "./operational-account.js";
import type { RelayInput, RelayResult } from "./schema.js";

export { createDeterministicWalletInitializer } from "./deterministic-wallet.js";
export type { RelayErrorCode } from "./errors.js";
export { RelayError } from "./errors.js";
export { awaitFinalTransaction, type FinalityOptions, type NonceWitness } from "./finality.js";
export { createNearRpcProvider, nearRpcRetryOptions } from "./near-rpc.js";
export {
  operationalAccount,
  resetOperationalNonce,
  sendOperationalTransaction,
} from "./operational-account.js";
export { policyStorageDeposit } from "./policy-storage.js";
export type { RelayInput, RelayResult } from "./schema.js";
export { relaySchema } from "./schema.js";
export {
  createSignedWalletRelayer,
  createWalletPolicyFunder,
  SIGNED_WALLET_RELAY_GAS,
} from "./signed-wallet.js";
export {
  addCosts,
  assertSponsorBalance,
  observeSponsorBalance,
  type SponsorBalanceObservation,
  type SponsorCost,
  transactionCost,
} from "./sponsor-balance.js";
export type { KeyPairString };
/** Protocol ceiling for one relayed transaction, shared across its actions. */
export const RELAY_MAX_TOTAL_GAS = 100_000_000_000_000n;
/** One action may not consume the whole budget, so a multi-action request stays bounded. */
export const RELAY_MAX_ACTION_GAS = 50_000_000_000_000n;

/** Signed NEP-366 relay boundary with owner signature and receiver checks. */
export function validateDelegate(
  input: RelayInput,
  ownerPublicKeyHex: string,
  allowedReceivers: string[],
) {
  if (!allowedReceivers.includes(input.receiverId)) throw new RelayError("relay_receiver_denied");
  let publicKey: PublicKey;
  try {
    publicKey = PublicKey.from(input.publicKey);
  } catch (cause) {
    throw new RelayError("relay_owner_mismatch", cause);
  }
  if (Buffer.from(publicKey.data).toString("hex") !== ownerPublicKeyHex)
    throw new RelayError("relay_owner_mismatch");
  if (publicKey.data.every((byte) => byte === 0)) throw new RelayError("relay_signature_invalid");
  let totalGas = 0n;
  for (const action of input.actions) {
    const gas = BigInt(action.gas);
    if (gas <= 0n || gas > RELAY_MAX_ACTION_GAS) throw new RelayError("relay_gas_limit");
    totalGas += gas;
  }
  if (totalGas <= 0n || totalGas > RELAY_MAX_TOTAL_GAS) throw new RelayError("relay_gas_limit");
  const delegateAction = {
    senderId: input.senderId,
    receiverId: input.receiverId,
    publicKey,
    nonce: BigInt(input.nonce),
    maxBlockHeight: BigInt(input.maxBlockHeight),
    actions: input.actions.map((a) =>
      actions.functionCall(a.methodName, Buffer.from(a.argsBase64, "base64"), BigInt(a.gas), 0n),
    ),
  };
  const signature = Buffer.from(input.signatureHex, "hex");
  if (
    !publicKey.verify(
      createHash("sha256").update(encodeDelegateAction(delegateAction)).digest(),
      signature,
    )
  )
    throw new RelayError("relay_signature_invalid");
  return { delegateAction, signature: new Signature({ keyType: 0, data: signature }) };
}
export function createNearRelayer(config: {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
  allowedReceivers: string[];
}): (
  input: RelayInput,
  ownerPublicKeyHex: string,
  beforeBroadcast: (transactionHash: string, witness?: NonceWitness) => Promise<void>,
) => Promise<RelayResult> {
  const provider = createNearRpcProvider(config.rpcUrls);
  return async (input: RelayInput, ownerPublicKeyHex: string, beforeBroadcast) => {
    const signed = validateDelegate(input, ownerPublicKeyHex, config.allowedReceivers);
    const access = await provider.viewAccessKey({
      accountId: input.senderId,
      publicKey: input.publicKey,
      finalityQuery: { finality: "final" },
    });
    if (
      access.permission !== "FullAccess" ||
      BigInt(input.nonce) <= access.nonce ||
      BigInt(input.maxBlockHeight) <= BigInt(access.block_height)
    )
      throw new RelayError("relay_authority_expired");
    // Fence after signing and before any broadcast; a refusal means nothing reached the chain.
    // The signed delegate has its own nonce; this call signs one outer transaction.
    const { hash: transactionHash, result } = await sendOperationalTransaction({
      ...config,
      beforeBroadcast,
      prepare: async (account) => {
        const prepared = await signOperationalTransaction(account, {
          receiverId: signed.delegateAction.senderId,
          actions: [actions.signedDelegate(signed)],
        });
        return {
          ...prepared,
          send: () =>
            awaitFinalTransaction({
              provider,
              transactionHash: prepared.hash,
              senderId: config.accountId,
              broadcast: () => provider.sendTransactionUntil(prepared.signedTransaction, "NONE"),
            }),
        };
      },
    });
    if (!transactionSucceeded(result))
      throw new Error("relay_transaction_failed", { cause: result.status });
    return {
      transactionHash,
      finalExecutionStatus: result.final_execution_status,
    };
  };
}

export { createOwnerSigningRequest, ownerNep413SigningDigest } from "./owner-message.js";
export type {
  OwnerPolicyDelegate,
  OwnerPolicySponsor,
  OwnerPolicySponsorConfig,
  OwnerPolicySubmission,
} from "./owner-policy.js";
export {
  createOwnerPolicySponsor,
  ownerPolicyAction,
  ownerPolicyDelegateSchema,
  ownerPolicySigningDigest,
  validateOwnerPolicyDelegate,
} from "./owner-policy.js";
