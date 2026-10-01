import type { Actor } from "@near-intents-agent-api/agents-core";
import {
  generateIntent,
  generateResponse,
  listAgents,
  readPolicy,
  readStatus,
  submitIntent,
  walletView,
} from "@near-intents-agent-api/agents-core";
import * as views from "@near-intents-agent-api/agents-core/views";
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
  const status = await readStatus(actor, generated.correlationId, 5000);
  expect(status.status).toBe("SUCCESS");
  return { agentId: generated.agentId, owner, signer };
}

describe("agent reads (ticket 10)", () => {
  it("scopes list, agent, wallet, and policy reads to the session's owner", async () => {
    const env = await setupCore("read-scope");
    try {
      const actor = await env.actor();
      const { agentId } = await onboard(env, actor, "Scoped");
      const page = await listAgents(actor, {});
      expect(page.agents).toHaveLength(1);
      expect(page.agents[0]?.id).toBe(agentId);
      expect(page.agents[0]?.status).toBe("active");

      const wallet = views.walletView(await walletView(actor, agentId));
      expect(wallet.nearAccountId).toBeTruthy();

      const view = await readPolicy(actor, agentId);
      expect(view.revision).toBe(1);
      expect(view.status).toBe("applied");

      const stranger = await env.actorAs("someone-else");
      const strangerPage = await listAgents(stranger, {});
      expect(strangerPage.agents).toHaveLength(0);
      await expect(walletView(stranger, agentId)).rejects.toMatchObject({
        code: "agent_not_found",
        status: 404,
      });
      await expect(readPolicy(stranger, agentId)).rejects.toMatchObject({
        code: "agent_not_found",
        status: 404,
      });
    } finally {
      await env.close();
    }
  });

  it("completes a policy_update lifecycle intent with one wallet signature", async () => {
    const env = await setupCore("policy-update");
    try {
      const actor = await env.actor();
      const { agentId, owner, signer } = await onboard(env, actor, "Updater");
      const created = await generateIntent(actor, {
        type: "policy_update",
        agentId,
        policy: { ...policy, frozen: true },
        expectedRevision: 1,
      });
      const generated = generateResponse(created.row);
      await submitIntent(actor, {
        type: "policy_update",
        correlationId: generated.correlationId,
        signedData: signer.sign(generated.intent),
      });
      const final = await readStatus(actor, generated.correlationId, 5000);
      expect(final.status).toBe("SUCCESS");

      const view = await readPolicy(actor, agentId);
      expect(view.revision).toBe(2);
      expect(view.policy?.frozen).toBe(true);
    } finally {
      await env.close();
    }
  });
});
