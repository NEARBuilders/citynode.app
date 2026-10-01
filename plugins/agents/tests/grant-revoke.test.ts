import {
  generateIntent,
  generateResponse,
  listAgentGrants,
  readStatus,
  runExecution,
  submitIntent,
  transferExecution,
} from "@near-intents-agent-api/agents-core";
import * as views from "@near-intents-agent-api/agents-core/views";
import { policySchema } from "@near-intents-agent-api/contracts";
import { describe, expect, it } from "vitest";
import { setupCore } from "./support/core-setup";
import { createGrantCredential } from "./support/grant-credential";
import { testDestinations } from "./support/grant-destinations";
import { nearOwnerFixture } from "./support/intent-signers";

const policy = policySchema.parse({
  version: 1,
  frozen: false,
  capabilities: {
    confidential: { allowed: false, requires_approval: false },
    cross_chain_withdraw: { allowed: false, requires_approval: true },
    evm_sign: { allowed: false, raw_tx: false },
    raw_sign: { allowed: false, chains: [], requires_approval: true },
    sign_message: { allowed: false, requires_approval: false, allowed_recipients: [] },
    swap: { allowed: true, requires_approval: false },
  },
  rules: { allowed_tokens: ["nep141:wrap.near"], transaction_types: ["transfer", "swap"] },
});

describe("grant revocation (ticket 11 tail)", () => {
  it("surfaces the committed correlation ids of work already dispatched", async () => {
    const env = await setupCore("revoke-reporting");
    try {
      const actor = await env.actor();
      const { owner, signer } = nearOwnerFixture();
      const created = await generateIntent(actor, {
        type: "agent_create",
        name: "Revoker",
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
      const agentId = generated.agentId;

      const credential = createGrantCredential();
      const grantIntent = await generateIntent(actor, {
        type: "grant_issue",
        agentId,
        label: "Committed work",
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

      env.provider.state.policyStatus = "pending";
      const executed = await runExecution(
        actor,
        agentId,
        transferExecution(
          {
            asset: "nep141:wrap.near",
            amount: "1",
            recipient: "recipient.near",
            confidential: false,
          },
          "revoke-committed-0001",
        ),
        credential.token,
      );
      expect(["PENDING", "UNCERTAIN", "PROCESSING"]).toContain(executed.status);
      env.provider.state.policyStatus = "success";

      const grants = (await listAgentGrants(actor, agentId)).map(views.grantView);
      const revoke = await generateIntent(actor, {
        type: "grant_revoke",
        agentId,
        grantId: grants[0]!.grantId,
      });
      const revokeGenerated = generateResponse(revoke.row);
      await submitIntent(actor, {
        type: "grant_revoke",
        correlationId: revokeGenerated.correlationId,
        signedData: signer.sign(revokeGenerated.intent),
      });
      const revokeStatus = await readStatus(actor, revokeGenerated.correlationId, 5000);
      expect(revokeStatus.status).toBe("SUCCESS");
      const details = revokeStatus.details as {
        committedCorrelationIds: string[] | null;
        committedTruncated: boolean | null;
      };
      expect(details.committedCorrelationIds).toContain(executed.correlationId);
      expect(details.committedTruncated).toBe(false);
    } finally {
      await env.close();
    }
  });
});
