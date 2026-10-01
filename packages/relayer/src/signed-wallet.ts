import type { SignedWalletRequest } from "@near-intents-agent-api/contracts";
import { actions, type KeyPairString } from "near-api-js";
import {
  type RelayTransactionOutcome,
  sponsorTransactionStatus,
  transactionSucceeded,
} from "./confirmation.js";
import { awaitFinalTransaction, type NonceWitness } from "./finality.js";
import { createNearRpcProvider } from "./near-rpc.js";
import { sendOperationalTransaction, signOperationalTransaction } from "./operational-account.js";
import { addCosts, assertSponsorBalance, type SponsorCost } from "./sponsor-balance.js";

/** Prepaid gas for one relayed `w_execute_signed`. */
export const SIGNED_WALLET_RELAY_GAS = 150_000_000_000_000n;

/** Sponsor submits user-signed w_execute_signed; its key never authorizes wallet actions. */
export function createSignedWalletRelayer(config: {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
}) {
  const provider = createNearRpcProvider(config.rpcUrls);
  const relay = async (
    msg: SignedWalletRequest["msg"],
    proof: string,
    beforeBroadcast: (transactionHash: string, witness?: NonceWitness) => Promise<void>,
  ): Promise<RelayTransactionOutcome> => {
    const tx = {
      receiverId: msg.signer_id,
      actions: [
        actions.functionCall(
          "w_execute_signed",
          {
            msg,
            proof,
          },
          SIGNED_WALLET_RELAY_GAS,
          0n,
        ),
      ],
    };
    const { hash, result } = await sendOperationalTransaction({
      ...config,
      beforeBroadcast,
      prepare: async (account) => {
        const signed = await signOperationalTransaction(account, tx);
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
    if (!transactionSucceeded(result)) throw new Error("wallet_relay_transaction_failed");
    return {
      transactionHash: hash,
      finalExecutionStatus: result.final_execution_status,
      status: result.status,
    };
  };
  return Object.assign(relay, {
    status: (transactionHash: string, accountId = config.accountId, witness?: NonceWitness) =>
      sponsorTransactionStatus(provider, accountId, transactionHash, witness),
    /** Refuses before any effect when the sponsor cannot fund `extra` and then relay. */
    assertBalance: (extra: SponsorCost) =>
      assertSponsorBalance(
        provider,
        config.accountId,
        addCosts(extra, { depositYocto: 0n, gas: SIGNED_WALLET_RELAY_GAS }),
      ),
  });
}

/**
 * Exact policy-storage funding after owner signs, bounded by API configuration. `journal` receives
 * the signed transfer's hash and nonce before it can be broadcast; if it throws, nothing is sent.
 */
export function createWalletPolicyFunder(config: {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
  beforeBroadcast?: (hash: string) => Promise<void>;
}) {
  const provider = createNearRpcProvider(config.rpcUrls);
  return async (
    receiverId: string,
    amount: bigint,
    journal: (transactionHash: string, witness?: NonceWitness) => Promise<void>,
  ) => {
    if (
      !/^(?:0s[0-9a-f]{40}|[a-z0-9]+(?:[._-][a-z0-9]+)*)$/.test(receiverId) ||
      receiverId.length > 64 ||
      amount <= 0n
    )
      throw new Error("wallet_funding_invalid");
    // One signed transfer per call; an ambiguous status never authorizes another nonce.
    const { hash, result } = await sendOperationalTransaction({
      ...config,
      beforeBroadcast: async (transactionHash, witness) => {
        await journal(transactionHash, witness);
        // Re-check the sponsor lease after the awaited journal write, right before sending.
        await config.beforeBroadcast?.(transactionHash);
      },
      prepare: async (account) => {
        const signed = await signOperationalTransaction(account, {
          receiverId,
          actions: [actions.transfer(amount)],
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
    if (!transactionSucceeded(result)) throw new Error("wallet_funding_failed");
    return hash;
  };
}
