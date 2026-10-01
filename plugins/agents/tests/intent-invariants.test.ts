import {
  configureOutlayer,
  generateIntent,
  generateResponse,
  readPolicy,
  readStatus,
  requirePrivilegedArtifactDeliveryAllowed,
  requireReadyPolicy,
  submitIntent,
  updateOwnerIntent,
} from "@near-intents-agent-api/agents-core";
import { policySchema } from "@near-intents-agent-api/contracts";
import { agents, auditEvents, ownerNonces } from "@near-intents-agent-api/database";
import { eq, sql } from "drizzle-orm";
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

describe("intent invariants (ticket 12)", () => {
  it("an unsigned freeze proposal blocks nothing; an accepted freeze blocks privileged delivery", async () => {
    const env = await setupCore("draft-authority");
    try {
      const { actor, signer, agentId } = await onboard(env);
      const encrypted = env.provider.encryptedPolicies.at(-1);
      expect(encrypted).toBeTruthy();
      const providerPolicy = JSON.parse(Buffer.from(encrypted ?? "", "base64").toString());
      const provider = env.provider;
      configureOutlayer({
        ...provider.client,
        async policy() {
          return providerPolicy;
        },
      } as never);
      await generateIntent(actor, { type: "agent_freeze", agentId });
      await generateIntent(actor, { type: "policy_update", agentId, policy, expectedRevision: 1 });
      await requireReadyPolicy(actor.tenantId, agentId);
      await env.database.db.transaction((tx) =>
        requirePrivilegedArtifactDeliveryAllowed(tx, actor.tenantId, agentId, "signing"),
      );
      expect((await readPolicy(actor, agentId)).revision).toBe(1);

      const freeze = await generateIntent(actor, { type: "agent_freeze", agentId });
      const freezeGenerated = generateResponse(freeze.row);
      env.ownerSponsor.setStatus("pending");
      const accepted = await submitIntent(actor, {
        type: "agent_freeze",
        correlationId: freezeGenerated.correlationId,
        signedData: signer.sign(freezeGenerated.intent),
      });
      expect(accepted.status).toBe("PROCESSING");
      await expect(requireReadyPolicy(actor.tenantId, agentId)).rejects.toThrow(/policy_not_ready/);
      await expect(
        env.database.db.transaction((tx) =>
          requirePrivilegedArtifactDeliveryAllowed(tx, actor.tenantId, agentId, "signing"),
        ),
      ).rejects.toThrow();
    } finally {
      await env.close();
    }
  });
});

describe("intent atomicity (ticket 12)", () => {
  it("rolls back a failed completion atomically and commits once on retry", async () => {
    const env = await setupCore("intent-atomic");
    try {
      const { actor, signer, agentId } = await onboard(env);
      const generated0 = await generateIntent(actor, {
        type: "timelock_set",
        agentId,
        delaySeconds: 3600,
      });
      const generated = generateResponse(generated0.row);
      const [before] = await env.database.db.select().from(agents).where(eq(agents.id, agentId));
      const noncesBefore = await env.database.db.select().from(ownerNonces);
      const submit = () =>
        submitIntent(actor, {
          type: "timelock_set",
          correlationId: generated.correlationId,
          signedData: signer.sign(generated.intent),
        });
      await env.database.db.execute(
        sql`CREATE FUNCTION reject_intent_completion() RETURNS trigger LANGUAGE plpgsql AS $atomic$ BEGIN IF NEW.state = 'completed' THEN RAISE EXCEPTION 'injected_completion_failure'; END IF; RETURN NEW; END $atomic$`,
      );
      await env.database.db.execute(
        sql`CREATE TRIGGER reject_completion BEFORE UPDATE ON owner_intents FOR EACH ROW EXECUTE FUNCTION reject_intent_completion()`,
      );
      await expect(submit()).rejects.toThrow();
      const [rolledBack] = await env.database.db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId));
      expect(rolledBack?.timelockRevision).toBe(before?.timelockRevision ?? null);
      expect(rolledBack?.policyEpoch).toBe(before?.policyEpoch);
      expect(await env.database.db.select().from(ownerNonces)).toEqual(noncesBefore);
      expect((await readStatus(actor, generated.correlationId)).status).toBe("PENDING_SIGNATURE");
      await env.database.db.execute(sql`DROP TRIGGER reject_completion ON owner_intents`);
      await env.database.db.execute(sql`DROP FUNCTION reject_intent_completion`);
      const completed = await submit();
      expect(completed.status).toBe("SUCCESS");
      expect(await submit()).toEqual(completed);
      const [after] = await env.database.db.select().from(agents).where(eq(agents.id, agentId));
      expect(after?.timelockRevision).toBe((before?.timelockRevision ?? 0) + 1);
      const audits = await env.database.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, "timelock.updated"));
      expect(audits).toHaveLength(1);
      await updateOwnerIntent(
        actor.tenantId,
        generated.correlationId,
        { state: "failed", failureCode: "intent-expired" },
        "pending_signature",
      );
      await updateOwnerIntent(actor.tenantId, generated.correlationId, { state: "submitted" });
      expect(await readStatus(actor, generated.correlationId)).toEqual(completed);
    } finally {
      await env.close();
    }
  });
});

async function onboard(env: Awaited<ReturnType<typeof setupCore>>) {
  const actor = await env.actor();
  const { owner, signer } = nearOwnerFixture();
  const created = await generateIntent(actor, {
    type: "agent_create",
    name: "Invariant",
    owner,
    policy,
  });
  const generated = generateResponse(created.row);
  await submitIntent(actor, {
    type: "agent_create",
    correlationId: generated.correlationId,
    signedData: signer.sign(generated.intent),
  });
  const status = await readStatus(actor, generated.correlationId, 5000);
  expect(status.status).toBe("SUCCESS");
  return { actor, signer, agentId: generated.agentId };
}
