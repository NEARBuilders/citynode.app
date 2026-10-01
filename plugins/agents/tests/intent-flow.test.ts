import {
  type Actor,
  configureDatabase,
  configureNearAccessKeyVerifier,
  configureNearAccountReader,
  configureNearPolicyOwnerVerifier,
  configureOutlayer,
  configurePolicyStorageEstimator,
  configureRuntime,
  generateIntent,
  generateResponse,
} from "@near-intents-agent-api/agents-core";
import { policySchema } from "@near-intents-agent-api/contracts";
import type { OutlayerWalletClient } from "@near-intents-agent-api/outlayer";
import { Context, Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { describe, expect, it } from "vitest";
import { actorForSession } from "../src/actor";
import type { DatabaseDriver } from "../src/db";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";
import { closeServer, startNearRpc } from "./support/near-rpc-double";

const sponsorPrivateKey =
  "ed25519:51wkXZuAj4mUpd8GskACyNj5omyifyUEKGECqiVRviBzT4gTFAFAVD5jYcmMdFEHRcDLt2iktJ6irQtzpa8PBmso";

function fakeOutlayerClient(): OutlayerWalletClient {
  return {
    contractId: "intents.near",
    async registerWallet() {
      return {
        api_key: "wk_test",
        near_account_id: "a".repeat(64),
        wallet_id: "wallet-test-1",
      };
    },
    async address() {
      return { address: `0x${"c".repeat(40)}` };
    },
    async encryptPolicy() {
      return { encrypted_base64: "ZmFrZS1lbmNyeXB0ZWQ=" };
    },
    async signPolicy() {
      return {
        public_key_hex: "a".repeat(64),
        signature_hex: "b".repeat(128),
      };
    },
  } as unknown as OutlayerWalletClient;
}

function configureTestInfra(nearRpcUrl: string) {
  configureOutlayer(fakeOutlayerClient());
  configurePolicyStorageEstimator(async () => "0");
  configureNearAccessKeyVerifier({ async verifyFullAccess() {} });
  configureNearAccountReader({
    async exists() {
      return false;
    },
  });
  configureNearPolicyOwnerVerifier(undefined);
  configureRuntime({
    trustedOrigins: ["https://citynode.app"],
    secretEncryptionKeys: { "env:v1": "t".repeat(32) },
    secretEncryptionActiveKeyId: "env:v1",
    nearRpcUrls: [nearRpcUrl],
    network: "mainnet",
    serviceUrl: "https://citynode.app",
    sponsorDailyGlobalLimit: 100,
    sponsorDailyTenantLimit: 20,
    sponsorDailyAgentLimit: 10,
    logLevel: "error",
  });
}

function withDriver(url: string, run: (driver: DatabaseDriver) => Promise<void>): Promise<void> {
  const layer = DatabaseLive(url).pipe(Layer.provide(Layer.succeed(PluginIdTag, "agents")));
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const context = yield* Layer.buildWithScope(layer, scope);
        const driver = Context.get(context, DatabaseTag);
        yield* Effect.tryPromise(() => run(driver));
      }),
    ),
  );
}

describe("owner intent flow (tracer bullet)", () => {
  it("generates an agent_create intent end-to-end and reports it PENDING_SIGNATURE", async () => {
    const rpc = await startNearRpc();
    try {
      configureTestInfra(rpc.url);
      await withDriver(
        `pglite:.bos/agents/flow-${Math.random().toString(36).slice(2)}:memory:`,
        async (driver) => {
          configureDatabase(driver);
          const actor: Actor = await actorForSession(driver, "user-1");
          const { row, replayed } = await generateIntent(actor, {
            type: "agent_create",
            name: "Chicago treasury agent",
            owner: {
              type: "near",
              accountId: "owner.citynode.near",
              publicKey: "ed25519:8hmo5Y36doLTzDnSUjR3bXntLW6VFmPrHLbnL5hMwwCp",
            },
            policy: policySchema.parse({
              version: 1,
              frozen: false,
              capabilities: minimalCapabilities(),
              rules: minimalRules(),
            }),
          });

          expect(replayed).toBe(false);
          const response = generateResponse(row);
          expect(response.type).toBe("agent_create");
          expect(response.status).toBe("PENDING_SIGNATURE");
          expect(response.agentId).toBeTruthy();
          expect(response.correlationId).toBe(row.id);
          expect((response.intent as { standard: string }).standard).toBe("nep366");
          expect(response.expiresAt > new Date().toISOString()).toBe(true);
        },
      );
    } finally {
      await closeServer(rpc.server);
    }
  });
});

function minimalCapabilities() {
  return {
    confidential: { allowed: false, requires_approval: false },
    cross_chain_withdraw: { allowed: false, requires_approval: false },
    evm_sign: { allowed: false, raw_tx: false },
    raw_sign: { allowed: false, chains: [], requires_approval: false },
    sign_message: { allowed: false, requires_approval: false, allowed_recipients: [] },
    swap: { allowed: true, requires_approval: false },
  };
}

function minimalRules() {
  return {
    allowed_tokens: ["nep141:usdc.token.near"],
    transaction_types: ["swap", "intents_transfer"],
  };
}
