import {
  configureDatabase,
  configureOutlayer,
  configureOwnerPolicySponsor,
  configurePolicyStorageEstimator,
  configureRuntime,
  configureWalletSponsor,
  generateIntent,
  generateResponse,
  readStatus,
  runExecution,
  submitIntent,
  transferExecution,
} from "@near-intents-agent-api/agents-core";
import { policySchema } from "@near-intents-agent-api/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { actorForSession } from "../src/actor";
import { stubOwnerSponsor, stubProvider, stubWalletSponsor } from "./support/agent-harness";
import { createGrantCredential } from "./support/grant-credential";
import { testDestinations } from "./support/grant-destinations";
import { nearOwnerFixture } from "./support/intent-signers";
import { closeServer, startNearRpc } from "./support/near-rpc-double";
import {
  dropRaceDatabase,
  raceDatabaseUrl,
  raceSuitesEnabled,
  resetRaceDatabase,
  withDatabase,
} from "./support/race-db";

const policy = policySchema.parse({
  version: 1,
  frozen: false,
  capabilities: {
    confidential: { allowed: false, requires_approval: false },
    cross_chain_withdraw: { allowed: false, requires_approval: true },
    evm_sign: { allowed: false, raw_tx: false },
    raw_sign: { allowed: false, chains: [], requires_approval: true },
    sign_message: { allowed: false, requires_approval: false, allowed_recipients: [] },
    swap: { allowed: false, requires_approval: false },
  },
  rules: { allowed_tokens: ["nep141:wrap.near"], transaction_types: ["transfer", "swap"] },
});

afterAll(() => dropRaceDatabase("agents_race_test"));

describe.skipIf(!raceSuitesEnabled())("concurrent admission against postgres (ticket 12)", () => {
  it("concurrent grant dispatches of one request commit the provider write exactly once", async () => {
    await resetRaceDatabase("agents_race_test");
    const rpc = await startNearRpc();
    try {
      await withDatabase(raceDatabaseUrl("agents_race_test"), async (driver) => {
        configureDatabase(driver);
        const provider = stubProvider();
        configureOutlayer(provider.client);
        configureOwnerPolicySponsor(stubOwnerSponsor().sponsor as never);
        configureWalletSponsor(stubWalletSponsor().sponsor as never);
        configurePolicyStorageEstimator(async () => "0");
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
        const actor = await actorForSession(driver, "race-user");
        const { owner, signer } = nearOwnerFixture();
        const created = await generateIntent(actor, {
          type: "agent_create",
          name: "Racer",
          owner,
          policy,
        });
        const generated = generateResponse(created.row);
        await submitIntent(actor, {
          type: "agent_create",
          correlationId: generated.correlationId,
          signedData: signer.sign(generated.intent),
        });
        await readStatus(actor, generated.correlationId, 5000);

        const credential = createGrantCredential();
        const grantIntent = await generateIntent(actor, {
          type: "grant_issue",
          agentId: generated.agentId,
          label: "Racing delegate",
          credential: credential.commitment,
          actions: ["intents_transfer"],
          recipients: testDestinations(["recipient.near"]),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
        const grantGenerated = generateResponse(grantIntent.row);
        await submitIntent(actor, {
          type: "grant_issue",
          correlationId: grantGenerated.correlationId,
          signedData: signer.sign(grantGenerated.intent),
        });
        await readStatus(actor, grantGenerated.correlationId, 5000);

        const before = provider.state.submissions;
        const attempt = () =>
          runExecution(
            actor,
            generated.agentId,
            transferExecution(
              {
                asset: "nep141:wrap.near",
                amount: "1",
                recipient: "recipient.near",
                confidential: false,
              },
              "race-once-0001",
            ),
            credential.token,
          );
        const results = await Promise.all(Array.from({ length: 8 }, attempt));
        for (const result of results) {
          expect(result.correlationId).toBe(results[0]?.correlationId);
        }
        expect(provider.state.submissions).toBe(before + 1);
        const status = await readStatus(actor, results[0]?.correlationId ?? "", 5000);
        expect(status.status).toBe("SUCCESS");
      });
    } finally {
      await closeServer(rpc.server);
    }
  });
});
