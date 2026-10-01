import type { TryAdvisoryLock } from "@near-intents-agent-api/database";
import { outlayerNetworks } from "@near-intents-agent-api/outlayer";
import {
  createDeterministicWalletInitializer,
  createNearRelayer,
  createNearRpcProvider,
  createOwnerPolicySponsor,
  createSignedWalletRelayer,
  createWalletPolicyFunder,
} from "@near-intents-agent-api/relayer";
import { JsonRpcProvider, KeyPair, type KeyPairString } from "near-api-js";
import type { Config } from "../config/env.js";
import { configureOwnerPolicySponsor } from "./owner-policy-sponsor.js";
import { configureRelayer, withSponsorLock } from "./relayer.js";
import { readSponsorBalance, watchSponsorBalance } from "./sponsor-balance.js";
import { configureSponsorPool, SponsorPool, sponsorIdentity } from "./sponsor-pool.js";
import { configureWalletSponsor } from "./wallet-sponsor.js";

/** Validate every registered FullAccess key before accepting requests. Never log private keys. */
export async function configureSponsorClients(config: Config, lock: TryAdvisoryLock) {
  const accountId = config.NEAR_SPONSOR_KEYS[0]?.accountId;
  if (!accountId) throw new Error("sponsor_pool_keys_required");
  const secrets = config.NEAR_SPONSOR_KEYS.map((key) => key.privateKey);
  const keys = await verifiedKeys(accountId, secrets, config.NEAR_RPC_URLS);
  watchSponsorBalance(BigInt(config.SPONSOR_BALANCE_WARN_YOCTO));
  await readSponsorBalance(createNearRpcProvider(config.NEAR_RPC_URLS), accountId);
  const entries = keys.map((key) => {
    const signer = {
      accountId,
      privateKey: key.privateKey,
      rpcUrls: config.NEAR_RPC_URLS,
      beforeBroadcast: async () => {
        sponsorIdentity();
      },
    };
    return {
      publicKey: key.publicKey,
      value: {
        policy: createOwnerPolicySponsor({
          ...signer,
          receiverId: outlayerNetworks.mainnet.contractId,
          gas: config.NEAR_POLICY_GAS,
          storageDepositYocto: config.NEAR_POLICY_STORAGE_DEPOSIT_YOCTO,
        }),
        fund: createWalletPolicyFunder(signer),
        initialize: createDeterministicWalletInitializer(signer),
        signed: createSignedWalletRelayer(signer),
        relay: createNearRelayer({
          ...signer,
          allowedReceivers: config.NEAR_RELAYER_ALLOWED_RECEIVERS.split(",").map((value) =>
            value.trim(),
          ),
        }),
      },
    };
  });
  const pool = new SponsorPool(
    accountId,
    entries,
    lock,
    config.SPONSOR_QUEUE_WAIT_MS,
    config.SPONSOR_QUEUE_MAX,
  );
  configureSponsorPool(pool);
  const first = entries[0];
  if (!first) throw new Error("sponsor_pool_keys_invalid");
  configureOwnerPolicySponsor({
    ...first.value.policy,
    submit: (...args) => pool.current().policy.submit(...args),
  });
  configureWalletSponsor({
    accountId,
    initialize: (...args) => pool.current().initialize(...args),
    fundPolicyStorage: (...args) => pool.current().fund(...args),
    relaySigned: Object.assign(
      (...args: Parameters<typeof first.value.signed>) => pool.current().signed(...args),
      { status: first.value.signed.status, assertBalance: first.value.signed.assertBalance },
    ),
  });
  configureRelayer(
    config.NEAR_RELAYER_ALLOWED_RECEIVERS.trim()
      ? withSponsorLock((...args) => pool.current().relay(...args), accountId)
      : undefined,
  );
}

async function verifiedKeys(accountId: string, secrets: string[], rpcUrls: string[]) {
  const keys = secrets.map((secret) => {
    try {
      const key = KeyPair.fromString(secret as KeyPairString);
      return { publicKey: key.getPublicKey().toString(), privateKey: secret as KeyPairString };
    } catch {
      throw new Error("sponsor_pool_key_invalid");
    }
  });
  if (new Set(keys.map((key) => key.publicKey)).size !== keys.length)
    throw new Error("sponsor_pool_duplicate_key");
  for (const key of keys) await verifyAccessKey(accountId, key.publicKey, rpcUrls);
  return keys;
}

async function verifyAccessKey(accountId: string, publicKey: string, rpcUrls: string[]) {
  for (const url of rpcUrls) {
    try {
      const access = await new JsonRpcProvider({ url }).viewAccessKey({
        accountId,
        publicKey,
        finalityQuery: { finality: "final" },
      });
      if (access.permission !== "FullAccess") throw new Error("sponsor_pool_key_restricted");
      return;
    } catch (error) {
      if (error instanceof Error && error.message === "sponsor_pool_key_restricted") throw error;
    }
  }
  // An implicit sponsor account does not exist on chain until its first transfer lands, so an
  // unfunded key surfaces here as "unavailable". Point at the README flow instead of failing
  // opaquely; never include private key material.
  throw new Error(
    `sponsor key ${publicKey} is not registered on ${accountId}: fund the account via ` +
      "https://near.com (see README#sponsor-account) or regenerate with pnpm sponsor:generate",
  );
}
