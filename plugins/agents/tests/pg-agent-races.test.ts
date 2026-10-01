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
import { sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { actorForSession } from "../src/actor";
import type { DatabaseDriver } from "../src/db";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";
import { stubOwnerSponsor, stubProvider, stubWalletSponsor } from "./support/agent-harness";
import { createGrantCredential } from "./support/grant-credential";
import { testDestinations } from "./support/grant-destinations";
import { nearOwnerFixture } from "./support/intent-signers";
import { closeServer, startNearRpc } from "./support/near-rpc-double";

const adminUrl = process.env.AGENTS_RACE_DATABASE_URL;
const raceDb = "agents_race_test";
const raceUrl = adminUrl?.replace(/\/[^/]+$/, `/${raceDb}`) ?? "";

async function resetRaceDatabase() {
  const admin = new pg.Pool({ connectionString: adminUrl });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${raceDb} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${raceDb}`);
  } finally {
    await admin.end();
  }
}

function withDatabase(url: string, run: (driver: DatabaseDriver) => Promise<void>): Promise<void> {
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

afterAll(async () => {
  const admin = new pg.Pool({ connectionString: adminUrl });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${raceDb} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

describe.skipIf(!adminUrl)("concurrent admission against postgres (ticket 12)", () => {
  it("concurrent grant dispatches of one request commit the provider write exactly once", async () => {
    await resetRaceDatabase();
    const rpc = await startNearRpc();
    try {
      await withDatabase(raceUrl, async (driver) => {
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
