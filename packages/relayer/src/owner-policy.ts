import { createHash } from "node:crypto";
import { type PolicyDelegate, policyDelegateSchema } from "@near-intents-agent-api/contracts";
import {
  actions,
  encodeDelegateAction,
  type KeyPairString,
  PublicKey,
  Signature,
} from "near-api-js";
import { sponsorTransactionStatus, transactionSucceeded } from "./confirmation.js";
import { RelayError } from "./errors.js";
import { awaitFinalTransaction, type NonceWitness } from "./finality.js";
import { createNearRpcProvider } from "./near-rpc.js";
import { sendOperationalTransaction, signOperationalTransaction } from "./operational-account.js";
import { policyStorageDeposit } from "./policy-storage.js";
import { assertSponsorBalance } from "./sponsor-balance.js";

export const ownerPolicyDelegateSchema = policyDelegateSchema;
export type OwnerPolicyDelegate = PolicyDelegate;
export type OwnerPolicySponsorConfig = {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
  receiverId: string;
  gas: string;
  storageDepositYocto: string;
};
export type OwnerPolicySubmission = {
  transactionHash: string;
  finalExecutionStatus: string;
};
export function ownerPolicyAction(input: OwnerPolicyDelegate) {
  const value = ownerPolicyDelegateSchema.parse(input);
  return {
    senderId: value.senderId,
    receiverId: value.receiverId,
    publicKey: PublicKey.from(value.publicKey),
    nonce: BigInt(value.nonce),
    maxBlockHeight: BigInt(value.maxBlockHeight),
    actions: value.actions.map((action) =>
      actions.functionCall(
        action.methodName,
        Buffer.from(action.argsBase64, "base64"),
        BigInt(action.gas),
        BigInt(action.depositYocto),
      ),
    ),
  };
}
export function ownerPolicySigningDigest(input: OwnerPolicyDelegate) {
  return createHash("sha256")
    .update(encodeDelegateAction(ownerPolicyAction(input)))
    .digest();
}
export function validateOwnerPolicyDelegate(
  input: OwnerPolicyDelegate,
  signatureHex: string,
  config: Pick<OwnerPolicySponsorConfig, "receiverId" | "gas" | "storageDepositYocto">,
) {
  const parsed = ownerPolicyDelegateSchema.parse(input);
  if (parsed.receiverId !== config.receiverId) throw new Error("policy_receiver_mismatch");
  if (
    parsed.actions[0]?.methodName !== "store_wallet_policy" &&
    (parsed.actions.length !== 1 || parsed.actions[0]?.depositYocto !== "0")
  )
    throw new Error("policy_action_invalid");
  if (
    parsed.actions
      .slice(1)
      .some((action) => action.methodName === "store_wallet_policy" || action.depositYocto !== "0")
  )
    throw new Error("policy_action_invalid");
  const gas = parsed.actions.reduce((sum, action) => sum + BigInt(action.gas), 0n);
  const deposit = parsed.actions.reduce((sum, action) => sum + BigInt(action.depositYocto), 0n);
  if (gas <= 0n || gas > BigInt(config.gas) || gas > 100_000_000_000_000n)
    throw new Error("policy_gas_limit");
  if (deposit > BigInt(config.storageDepositYocto) || deposit > 1_000_000_000_000_000_000_000_000n)
    throw new Error("policy_deposit_limit");
  if (
    !/^[0-9a-f]{128}$/.test(signatureHex) ||
    !PublicKey.from(parsed.publicKey).verify(
      ownerPolicySigningDigest(parsed),
      Buffer.from(signatureHex, "hex"),
    )
  )
    throw new Error("policy_delegate_signature_invalid");
  return parsed;
}

/** Sponsor funds gas and bounded storage; the user's account remains predecessor/controller. */
export function createOwnerPolicySponsor(config: OwnerPolicySponsorConfig) {
  if (
    BigInt(config.gas) <= 0n ||
    BigInt(config.gas) > 100_000_000_000_000n ||
    BigInt(config.storageDepositYocto) < 0n ||
    BigInt(config.storageDepositYocto) > 10n ** 24n
  )
    throw new Error("policy_sponsor_budget_invalid");
  const provider = createNearRpcProvider(config.rpcUrls);
  return {
    accountId: config.accountId,
    receiverId: config.receiverId,
    gas: config.gas,
    storageDepositYocto: config.storageDepositYocto,
    async prepare(
      input: Pick<OwnerPolicyDelegate, "senderId" | "publicKey" | "actions">,
    ): Promise<OwnerPolicyDelegate> {
      const preparedActions = [];
      for (const action of input.actions) {
        preparedActions.push({
          ...action,
          depositYocto:
            action.methodName === "store_wallet_policy"
              ? await policyStorageDeposit(
                  provider,
                  config.receiverId,
                  input.senderId,
                  action.argsBase64,
                  config.storageDepositYocto,
                  true,
                )
              : "0",
        });
      }
      const access = await provider.viewAccessKey({
        accountId: input.senderId,
        publicKey: input.publicKey,
        finalityQuery: { finality: "final" },
      });
      if (access.permission !== "FullAccess") throw new Error("owner_key_not_full_access");
      return ownerPolicyDelegateSchema.parse({
        ...input,
        actions: preparedActions,
        receiverId: config.receiverId,
        nonce: (access.nonce + 1n).toString(),
        maxBlockHeight: (BigInt(access.block_height) + 120n).toString(),
      });
    },
    async blockHeight() {
      return BigInt((await provider.viewBlock({ finality: "final" })).header.height);
    },
    async status(transactionHash: string, accountId = config.accountId, witness?: NonceWitness) {
      return sponsorTransactionStatus(provider, accountId, transactionHash, witness);
    },
    /**
     * Refuses before any effect when the sponsor cannot relay `input`. As the delegate's relayer it
     * pays the inner storage deposit as well as the gas.
     */
    async assertBalance(input: Pick<OwnerPolicyDelegate, "actions">) {
      const cost = input.actions.reduce(
        (total, action) => ({
          depositYocto: total.depositYocto + BigInt(action.depositYocto),
          gas: total.gas + BigInt(action.gas),
        }),
        { depositYocto: 0n, gas: 0n },
      );
      await assertSponsorBalance(provider, config.accountId, cost);
    },
    async submit(
      input: OwnerPolicyDelegate,
      signatureHex: string,
      beforeBroadcast: (transactionHash: string, witness?: NonceWitness) => Promise<void>,
      beforeSigning?: () => Promise<void>,
    ): Promise<OwnerPolicySubmission> {
      validateOwnerPolicyDelegate(input, signatureHex, config);
      for (const action of input.actions) {
        if (
          action.methodName === "store_wallet_policy" &&
          action.depositYocto !==
            (await policyStorageDeposit(
              provider,
              config.receiverId,
              input.senderId,
              action.argsBase64,
              config.storageDepositYocto,
              true,
            ))
        )
          throw new Error("policy_storage_changed");
      }
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
        throw new RelayError("policy_delegate_expired");
      // The server submits its persisted, bounded preparation. A later RPC can
      // return an older final block; reapplying the 120-block horizon here rejects
      // a valid freshly prepared delegate on load-balanced RPC endpoints.
      await beforeSigning?.();
      // The owner's delegate carries its own nonce. The sponsor signs only one outer transaction
      // here; `beforeBroadcast` records its hash before it reaches the network.
      const { hash: transactionHash, result } = await sendOperationalTransaction({
        rpcUrls: config.rpcUrls,
        accountId: config.accountId,
        privateKey: config.privateKey,
        beforeBroadcast,
        prepare: async (sponsor) => {
          const signed = await signOperationalTransaction(sponsor, {
            receiverId: input.senderId,
            actions: [
              actions.signedDelegate({
                delegateAction: ownerPolicyAction(input),
                signature: new Signature({ keyType: 0, data: Buffer.from(signatureHex, "hex") }),
              }),
            ],
          });
          return {
            ...signed,
            send: () =>
              awaitFinalTransaction({
                provider,
                transactionHash: signed.hash,
                senderId: config.accountId,
                broadcast: () => provider.sendTransactionUntil(signed.signedTransaction, "NONE"),
              }),
          };
        },
      });
      if (!transactionSucceeded(result)) throw new Error("policy_transaction_failed");
      return { transactionHash, finalExecutionStatus: result.final_execution_status };
    },
  };
}
export type OwnerPolicySponsor = ReturnType<typeof createOwnerPolicySponsor>;
