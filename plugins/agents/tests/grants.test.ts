import type { Actor } from "@near-intents-agent-api/agents-core";
import {
  generateIntent,
  generateResponse,
  listAgentGrants,
  readStatus,
  submitIntent,
} from "@near-intents-agent-api/agents-core";
import * as views from "@near-intents-agent-api/agents-core/views";
import { policySchema } from "@near-intents-agent-api/contracts";
import { describe, expect, it } from "vitest";
import { setupCore } from "./support/core-setup";
import { createGrantCredential } from "./support/grant-credential";
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
  rules: { allowed_tokens: ["native"], transaction_types: ["transfer", "swap"] },
});

async function onboard(_env: Awaited<ReturnType<typeof setupCore>>, actor: Actor, name: string) {
  const { owner, signer } = nearOwnerFixture();
  const created = await generateIntent(actor, { type: "agent_create", name, owner, policy });
  const generated = generateResponse(created.row);
  await submitIntent(actor, {
    type: "agent_create",
    correlationId: generated.correlationId,
    signedData: signer.sign(generated.intent),
  });
  return { agentId: generated.agentId, signer };
}

describe("grants (ticket 11)", () => {
  it("issues a grant with one owner signature, keeps the token at rest, and revokes", async () => {
    const env = await setupCore("grants");
    try {
      const actor = await env.actor();
      const { agentId, signer } = await onboard(env, actor, "Grantor");
      const credential = createGrantCredential();
      const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

      const created = await generateIntent(actor, {
        type: "grant_issue",
        agentId,
        label: "Trading assistant",
        credential: credential.commitment,
        actions: ["swap", "intents_transfer"],
        expiresAt,
      });
      const generated = generateResponse(created.row);
      expect(generated.intent.standard).toBe("nep413");

      await submitIntent(actor, {
        type: "grant_issue",
        correlationId: generated.correlationId,
        signedData: signer.sign(generated.intent),
      });
      const status = await readStatus(actor, generated.correlationId, 5000);
      expect(status.status).toBe("SUCCESS");

      const grants = (await listAgentGrants(actor, agentId)).map(views.grantView);
      expect(grants).toHaveLength(1);
      expect(grants[0]?.label).toBe("Trading assistant");
      expect(grants[0]?.actions).toEqual(["swap", "intents_transfer"]);
      expect(JSON.stringify(grants)).not.toContain(credential.token);

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
      expect((await readStatus(actor, revokeGenerated.correlationId, 5000)).status).toBe("SUCCESS");
      const after = (await listAgentGrants(actor, agentId)).map(views.grantView);
      expect(after).toHaveLength(1);
      expect(after[0]?.revokedAt).toBeTruthy();
    } finally {
      await env.close();
    }
  });
});
