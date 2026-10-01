import { createHash } from "node:crypto";
import type { Intent, SignedData } from "@near-intents-agent-api/contracts/api";
import { ownerNep413SigningDigest } from "@near-intents-agent-api/relayer/owner-message";
import {
  actions,
  encodeDelegateAction,
  encodeSignedDelegate,
  KeyPair,
  type KeyPairEd25519,
  Signature,
} from "near-api-js";

/**
 * Wallet doubles for generated intents. Each returns exactly what a real wallet returns for the
 * standard, so tests exercise the server's normalization instead of pre-normalizing:
 * NEAR returns base64 NEP-413 signatures and a base64 borsh `SignedDelegate`, like near-connect.
 * Ported from the upstream test suite; EVM/passkey signers arrive with the delegated-execution
 * port.
 */
export type IntentSigner = { sign(intent: Intent): SignedData };

export function ed25519Keypair() {
  const keyPair = KeyPair.fromRandom("ed25519") as KeyPairEd25519;
  return {
    keyPair,
    publicKey: keyPair.getPublicKey().toString(),
    publicKeyHex: Buffer.from(keyPair.getPublicKey().data).toString("hex"),
  };
}

export function nearIntentSigner(keyPair: KeyPair, accountId: string): IntentSigner {
  return {
    sign(intent) {
      if (intent.standard === "nep413") {
        const digest = ownerNep413SigningDigest({
          message: intent.payload.message,
          recipient: intent.payload.recipient,
          nonce: Buffer.from(intent.payload.nonce, "base64"),
        });
        return {
          ...intent,
          public_key: keyPair.getPublicKey().toString(),
          signature: Buffer.from(keyPair.sign(digest).signature).toString("base64"),
        };
      }
      if (intent.standard === "nep366") {
        const delegateAction = {
          senderId: accountId,
          receiverId: intent.payload.receiverId,
          publicKey: keyPair.getPublicKey(),
          nonce: 1n,
          maxBlockHeight: 100n,
          actions: intent.payload.actions.map((action) =>
            actions.functionCall(
              action.params.methodName,
              Buffer.from(JSON.stringify(action.params.args)),
              BigInt(action.params.gas),
              BigInt(action.params.deposit),
            ),
          ),
        };
        const digest = createHash("sha256").update(encodeDelegateAction(delegateAction)).digest();
        const signedDelegate = Buffer.from(
          encodeSignedDelegate({
            delegateAction,
            signature: new Signature({ keyType: 0, data: keyPair.sign(digest).signature }),
          }),
        ).toString("base64");
        return { ...intent, signedDelegate };
      }
      throw new Error(`near signer cannot sign ${intent.standard}`);
    },
  };
}

export function nearOwnerFixture(accountId = "owner.near") {
  const { keyPair, publicKey } = ed25519Keypair();
  const owner = {
    type: "near",
    accountId,
    publicKey,
  } as const;
  return { owner, keyPair, publicKey, signer: nearIntentSigner(keyPair, accountId) };
}
