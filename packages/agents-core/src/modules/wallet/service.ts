import type { Wallet } from "@near-intents-agent-api/contracts";
import type { OutlayerWalletClient } from "@near-intents-agent-api/outlayer";
import { getOutlayer } from "../../lib/outlayer.js";
import { newId } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { isSupportedNearPolicyAccountId } from "../../shared/near.js";
import { openSecret, type SecretContext, sealSecret } from "../../shared/secrets.js";
import {
  activateCustodyWallet,
  type CustodyWalletRecord,
  failCustodyWallet,
  findCustodyWallet,
  insertProvisioningWallet,
} from "./repository.js";

export function custodyCredential(wallet: CustodyWalletRecord) {
  return openSecret(
    {
      ciphertext: wallet.credentialCiphertext,
      keyId: wallet.credentialKeyId,
      nonce: wallet.credentialNonce,
    },
    custodyCredentialContext(wallet),
  );
}

/**
 * The credential is only valid for this exact tenant/agent/wallet row. `walletId` uses the
 * immutable row id, not the provider wallet id: the provider id can be rewritten on re-register
 * while the row stays the same. Binding the provider identity too means a relocated ciphertext
 * fails authentication rather than decrypting into the wrong wallet context.
 */
function custodyCredentialContext(wallet: CustodyWalletRecord): SecretContext {
  return {
    schemaVersion: 1,
    tenantId: wallet.tenantId,
    agentId: wallet.agentId,
    walletId: wallet.id,
    providerId: wallet.providerWalletId || undefined,
    purpose: "outlayer.custody_credential",
  };
}

/** A resolved EVM address, or null. An unresolved address is not an address. */
export function projectEvmAddress(value: string): string | null {
  return /^0x[0-9a-f]{40}$/.test(value) ? value : null;
}

export function toWallet(wallet: CustodyWalletRecord): Wallet {
  return {
    wallet_id: wallet.providerWalletId,
    near_account_id: wallet.nearAccountId,
    evm_address: projectEvmAddress(wallet.evmAddress),
  };
}

export async function requireActiveWallet(tenantId: string, agentId: string) {
  const wallet = await findCustodyWallet(tenantId, agentId);
  if (!wallet) throw new ApiError("wallet_not_provisioned", 409);
  if (wallet.status !== "active") throw new ApiError("wallet_not_active", 409);
  return wallet;
}

/** Registers one OutLayer custody wallet per agent. The owner wallet is never custody. */
export async function provisionWallet(tenantId: string, agentId: string) {
  const existing = await findCustodyWallet(tenantId, agentId);
  if (existing?.status === "active") return existing;

  if (existing) throw new ApiError("wallet_provisioning_uncertain", 409);
  const client = getOutlayer();
  const reservedId = newId();
  const reserved = await insertProvisioningWallet({
    id: reservedId,
    tenantId,
    agentId,
    credential: sealSecret("pending", {
      schemaVersion: 1,
      tenantId,
      agentId,
      walletId: reservedId,
      purpose: "outlayer.custody_credential",
    }),
  });
  if (!reserved) {
    const winner = await findCustodyWallet(tenantId, agentId);
    if (!winner) throw new ApiError("wallet_conflict", 409);
    if (winner.status !== "active") throw new ApiError("wallet_provisioning_uncertain", 409);
    return winner;
  }

  try {
    const registered = await client.registerWallet();
    if (!isSupportedNearPolicyAccountId(registered.near_account_id))
      throw new Error("unsupported_custody_near_account_id");
    // Persist the only copy of the credential before any optional provider call.
    const evm = "";
    await activateCustodyWallet({
      id: reserved.id,
      tenantId,
      providerWalletId: registered.wallet_id,
      nearAccountId: registered.near_account_id,
      evmAddress: evm,
      credential: sealSecret(registered.api_key, {
        schemaVersion: 1,
        tenantId,
        agentId,
        walletId: reserved.id,
        providerId: registered.wallet_id,
        purpose: "outlayer.custody_credential",
      }),
    });
    const evmAddress = await resolveEvmAddress(client, registered.api_key);
    if (evmAddress)
      await activateCustodyWallet({
        id: reserved.id,
        tenantId,
        providerWalletId: registered.wallet_id,
        nearAccountId: registered.near_account_id,
        evmAddress,
        credential: sealSecret(registered.api_key, {
          schemaVersion: 1,
          tenantId,
          agentId,
          walletId: reserved.id,
          providerId: registered.wallet_id,
          purpose: "outlayer.custody_credential",
        }),
      });
  } catch {
    await failCustodyWallet(reserved.id);
    throw new ApiError("wallet_provisioning_failed", 502);
  }

  const wallet = await findCustodyWallet(tenantId, agentId);
  if (!wallet) throw new ApiError("wallet_conflict", 409);
  return wallet;
}

/**
 * Resolves the wallet's EVM address. A provider outage must not permanently record an empty
 * address, so this retries a bounded number of times and returns `""` only after exhausting them;
 * `toWallet` projects an empty value as `null` and the address can be filled in by re-provisioning.
 */
async function resolveEvmAddress(client: OutlayerWalletClient, apiKey: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const evm = await client.address(apiKey, "ethereum");
      return /^0x[0-9a-fA-F]{40}$/.test(evm.address) ? evm.address.toLowerCase() : "";
    } catch {
      if (attempt < 2) await new Promise((done) => setTimeout(done, 500 * (attempt + 1)));
    }
  }
  return "";
}
