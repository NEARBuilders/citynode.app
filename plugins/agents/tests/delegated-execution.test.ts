import type { Actor } from "@near-intents-agent-api/agents-core";
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
    swap: { allowed: false, requires_approval: false },
  },
  rules: { allowed_tokens: ["nep141:wrap.near"], transaction_types: ["transfer", "call"] },
});

async function onboard(env: Awaited<ReturnType<typeof setupCore>>, actor: Actor, name: string) {
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

async function issueGrant(
  env: Awaited<ReturnType<typeof setupCore>>,
  actor: Actor,
  signer: ReturnType<typeof nearOwnerFixture>["signer"],
  agentId: string,
  actions: string[],
  recipients: string[] = ["recipient.near"],
) {
  const credential = createGrantCredential();
  const created = await generateIntent(actor, {
    type: "grant_issue",
    agentId,
    label: "test grant",
    credential: credential.commitment,
    actions,
    recipients: testDestinations(recipients),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const generated = generateResponse(created.row);
  await submitIntent(actor, {
    type: "grant_issue",
    correlationId: generated.correlationId,
    signedData: signer.sign(generated.intent),
  });
  const status = await readStatus(actor, generated.correlationId, 5000);
  expect(status.status).toBe("SUCCESS");
  return credential.token;
}

describe("delegated execution (ticket 11)", () => {
  it("executes a grant-scoped transfer within policy and dispatches once", async () => {
    const env = await setupCore("delegated-transfer");
    try {
      const actor = await env.actor();
      const { agentId, signer } = await onboard(env, actor, "Executor");
      const token = await issueGrant(env, actor, signer, agentId, ["intents_transfer"]);
      const before = env.provider.state.submissions;
      const status = await runExecution(
        actor,
        agentId,
        transferExecution(
          {
            asset: "nep141:wrap.near",
            amount: "1",
            recipient: "recipient.near",
            confidential: false,
          },
          "delegate-happy-0001",
        ),
        token,
      );
      expect(status.status).toBe("SUCCESS");
      expect(env.provider.state.submissions).toBe(before + 1);
    } finally {
      await env.close();
    }
  });

  it("refuses an action outside the grant with the per-layer error", async () => {
    const env = await setupCore("delegated-scope");
    try {
      const actor = await env.actor();
      const { agentId, signer } = await onboard(env, actor, "Narrow grant");
      const token = await issueGrant(env, actor, signer, agentId, ["intents_transfer"]);
      await expect(
        runExecution(actor, agentId, swapExecutionFixture("delegate-swap-0001"), token),
      ).rejects.toMatchObject({ code: "grant_action_denied", status: 403 });
    } finally {
      await env.close();
    }
  });

  it("refuses work under a revoked grant", async () => {
    const env = await setupCore("delegated-revoke");
    try {
      const actor = await env.actor();
      const { agentId, signer } = await onboard(env, actor, "Revoked");
      const token = await issueGrant(env, actor, signer, agentId, ["intents_transfer"]);
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
      await expect(
        runExecution(
          actor,
          agentId,
          transferExecution(
            {
              asset: "nep141:wrap.near",
              amount: "1",
              recipient: "recipient.near",
              confidential: false,
            },
            "delegate-revoked-0001",
          ),
          token,
        ),
      ).rejects.toMatchObject({ code: "agent_grant_required", status: 403 });
    } finally {
      await env.close();
    }
  });

  it("refuses the same idempotency key with a different payload", async () => {
    const env = await setupCore("delegated-idempotency");
    try {
      const actor = await env.actor();
      const { agentId, signer } = await onboard(env, actor, "Idempotent");
      const token = await issueGrant(env, actor, signer, agentId, ["intents_transfer"]);
      const transfer = (amount: string) =>
        transferExecution(
          { asset: "nep141:wrap.near", amount, recipient: "recipient.near", confidential: false },
          "delegate-conflict-0001",
        );
      await runExecution(actor, agentId, transfer("1"), token);
      await expect(runExecution(actor, agentId, transfer("2"), token)).rejects.toMatchObject({
        code: "idempotency_conflict",
        status: 409,
      });
    } finally {
      await env.close();
    }
  });
});

function swapExecutionFixture(idempotencyKey: string) {
  return {
    action: "swap" as const,
    request: {
      token_in: "nep141:wrap.near",
      token_out: "nep141:usdc.token.near",
      amount_in: "1",
      idempotencyKey,
    },
  };
}
