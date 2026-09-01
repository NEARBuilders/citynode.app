import { FileKeyStore } from "near-kit/keys/file";
import { isPrivateKey, Near, type PrivateKey } from "near-kit";

import type { NetworkId } from "./fastkv";
import { NearTransactionError } from "./near-cli";

function assertPrivateKey(key: string): PrivateKey {
  if (!isPrivateKey(key)) {
    throw new NearTransactionError(
      `Invalid private key format: must start with "ed25519:" or "secp256k1:". Got: ${key.slice(0, 10)}...`,
    );
  }
  return key as PrivateKey;
}

export type SigningKeySource = "provided" | "credentials-file";

export interface ResolvedSigningKey {
  source: SigningKeySource;
  privateKey: string;
}

export interface FunctionCallTransaction {
  account: string;
  contract: string;
  method: string;
  args: Record<string, string>;
  network: NetworkId;
  privateKey: string;
}

export interface NearTransactionResult {
  success: true;
  txHash?: string;
}

export async function resolveSigningKey(opts: {
  privateKey?: string;
  account: string;
  network: NetworkId;
}): Promise<ResolvedSigningKey> {
  const explicitKey =
    opts.privateKey || process.env.NEAR_PRIVATE_KEY || process.env.BOS_NEAR_PRIVATE_KEY;
  if (explicitKey) {
    return { source: "provided", privateKey: explicitKey };
  }

  const keyStore = new FileKeyStore("~/.near-credentials", opts.network);
  const keyPair = await keyStore.get(opts.account);
  if (keyPair?.secretKey) {
    return { source: "credentials-file", privateKey: keyPair.secretKey };
  }

  throw new NearTransactionError(
    `No signing key available for ${opts.account} on ${opts.network}. ` +
      `Set NEAR_PRIVATE_KEY (or BOS_NEAR_PRIVATE_KEY), or store credentials at ` +
      `~/.near-credentials/${opts.network}/${opts.account}.json. ` +
      `Generate a publish key with: bos key generate`,
  );
}

export async function submitFunctionCallTransaction(
  tx: FunctionCallTransaction,
): Promise<NearTransactionResult> {
  const near = new Near({
    network: tx.network,
    defaultSignerId: tx.account,
    privateKey: assertPrivateKey(tx.privateKey),
  });

  const outcome = await near
    .transaction(tx.account)
    .functionCall(tx.contract, tx.method, tx.args, {
      gas: "300 Tgas",
      attachedDeposit: "0 yocto",
    })
    .send();

  const txHash = outcome?.transaction?.hash;
  return { success: true, txHash };
}
