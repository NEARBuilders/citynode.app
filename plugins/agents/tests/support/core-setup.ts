import type { Actor } from "@near-intents-agent-api/agents-core";
import {
  configureDatabase,
  configureNearVerifier,
  configureOutlayer,
  configureOwnerPolicySponsor,
  configureRuntime,
  configureWalletSponsor,
} from "@near-intents-agent-api/agents-core";
import { createTestDatabase } from "@near-intents-agent-api/database/testing";
import { PublicKey } from "near-api-js";
import { actorForSession } from "../../src/actor";
import type { DatabaseDriver } from "../../src/db";
import { nep413Digest, stubOwnerSponsor, stubProvider, stubWalletSponsor } from "./agent-harness";
import { closeServer, startNearRpc } from "./near-rpc-double";

/**
 * One isolated core: PGlite database, provider and sponsor doubles, a local NEAR RPC for owner
 * wallets. NEAR NEP-413 proofs are checked against the signed key. Ported from the upstream
 * integration rig, with the plugin's session→actor mapping in place of API keys.
 */
export async function setupCore(userId: string) {
  const database = await createTestDatabase();
  configureDatabase(database as unknown as DatabaseDriver);
  const provider = stubProvider();
  configureOutlayer(provider.client);
  const ownerSponsor = stubOwnerSponsor();
  configureOwnerPolicySponsor(ownerSponsor.sponsor as never);
  const walletSponsor = stubWalletSponsor();
  configureWalletSponsor(walletSponsor.sponsor as never);
  configureNearVerifier({
    async verify(input) {
      if (
        !PublicKey.from(input.publicKey).verify(
          nep413Digest(input),
          Buffer.from(input.signatureHex, "hex"),
        )
      )
        throw new Error("near_owner_proof_invalid");
    },
  });
  const rpc = await startNearRpc();
  configureRuntime({
    trustedOrigins: ["https://citynode.app"],
    secretEncryptionKeys: { "env:v1": "t".repeat(32) },
    secretEncryptionActiveKeyId: "env:v1",
    nearRpcUrls: [rpc.url],
    network: "mainnet",
    serviceUrl: "https://citynode.app",
    sponsorDailyGlobalLimit: 100,
    sponsorDailyTenantLimit: 20,
    sponsorDailyAgentLimit: 10,
    walletPolicyStorageLimitYocto: "11900000000000000000000",
    sponsorAccountId: "sponsor.near",
    logLevel: "error",
  });
  const actor = (keyId = "session") =>
    actorForSession(database as unknown as DatabaseDriver, userId, keyId) as Promise<Actor>;
  return {
    database,
    provider,
    ownerSponsor,
    walletSponsor,
    rpc,
    actor,
    async close() {
      configureWalletSponsor(undefined);
      configureNearVerifier(undefined);
      await closeServer(rpc.server);
      await database.close();
    },
  };
}

export { stubOwnerSponsor, stubProvider, stubWalletSponsor };
