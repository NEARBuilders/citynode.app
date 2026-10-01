import {
  generateIntent,
  generateResponse,
  readStatus,
  submitIntent,
} from "@near-intents-agent-api/agents-core";
import { policySchema } from "@near-intents-agent-api/contracts";
import { describe, expect, it } from "vitest";
import { setupCore } from "./support/core-setup";
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
    swap: { allowed: false, requires_approval: false },
  },
  rules: { allowed_tokens: ["native"], transaction_types: ["transfer"] },
});

describe("owner intent submit (sponsor relay leg)", () => {
  it("binds the owner only once the onboarding transaction finalizes", async () => {
    const env = await setupCore("onboarding-final");
    try {
      const actor = await env.actor();
      const { owner, signer } = nearOwnerFixture();
      const created = await generateIntent(actor, {
        type: "agent_create",
        name: "Finality",
        owner,
        policy,
      });
      const generated = generateResponse(created.row);
      env.ownerSponsor.setStatus("pending");
      const submitted = await submitIntent(actor, {
        type: "agent_create",
        correlationId: generated.correlationId,
        signedData: signer.sign(generated.intent),
      });
      expect(submitted.status).toBe("PROCESSING");
      expect(env.ownerSponsor.calls.length).toBe(1);

      env.ownerSponsor.setStatus("succeeded");
      env.ownerSponsor.setStatus("succeeded");
      const live = await readStatus(actor, generated.correlationId, 5000);
      expect(live.status).toBe("SUCCESS");
    } finally {
      await env.close();
    }
  });

  it("dedupes an interrupted generation by idempotency key", async () => {
    const env = await setupCore("idempotent-generate");
    try {
      const actor = await env.actor();
      const { owner } = nearOwnerFixture();
      const first = await generateIntent(
        actor,
        { type: "agent_create", name: "Recoverable", owner, policy },
        "intent-key-1",
      );
      const second = await generateIntent(
        actor,
        { type: "agent_create", name: "Recoverable", owner, policy },
        "intent-key-1",
      );
      expect(second.replayed).toBe(true);
      expect(second.row.id).toBe(first.row.id);
      expect(second.row.intent).toEqual(first.row.intent);
    } finally {
      await env.close();
    }
  });

  it("replays the settled status instead of rebroadcasting on a second submission", async () => {
    const env = await setupCore("double-submit");
    try {
      const actor = await env.actor();
      const { owner, signer } = nearOwnerFixture();
      const created = await generateIntent(actor, {
        type: "agent_create",
        name: "Once",
        owner,
        policy,
      });
      const generated = generateResponse(created.row);
      const signedData = signer.sign(generated.intent);
      await submitIntent(actor, {
        type: "agent_create",
        correlationId: generated.correlationId,
        signedData,
      });
      const second = await submitIntent(actor, {
        type: "agent_create",
        correlationId: generated.correlationId,
        signedData,
      });
      expect(second.status).toBe("SUCCESS");
      expect(env.ownerSponsor.calls.length).toBe(1);
    } finally {
      await env.close();
    }
  });
});
