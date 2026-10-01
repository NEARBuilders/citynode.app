import {
  configurePrices,
  generateIntent,
  generateResponse,
  readBudget,
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

const wnear = 10n ** 24n;
const tokens = (whole: number) => ((BigInt(Math.round(whole * 100)) * wnear) / 100n).toString();
const oneDollarPerToken = () => ({
  decimals: 24,
  coefficient: 1n,
  scale: 0,
  updatedAtMs: Date.now(),
});

describe("USD budget charges at dispatch (ticket 11 tail)", () => {
  it("charges within the owner's cap, refuses the spend that would exceed it, and frees on reset", async () => {
    const env = await setupCore("budget-daily");
    try {
      const actor = await env.actor();
      const { owner, signer } = nearOwnerFixture();
      const created = await generateIntent(actor, {
        type: "agent_create",
        name: "Budgeted",
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
        label: "Budgeted delegate",
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

      configurePrices({ price: async () => oneDollarPerToken() });
      try {
        const budgetIntent = await generateIntent(actor, {
          type: "budget_set",
          agentId,
          dailyUsd: "2",
          weeklyUsd: null,
          monthlyUsd: null,
        });
        const budgetGenerated = generateResponse(budgetIntent.row);
        await submitIntent(actor, {
          type: "budget_set",
          correlationId: budgetGenerated.correlationId,
          signedData: signer.sign(budgetGenerated.intent),
        });
        const budgetStatus = await readStatus(actor, budgetGenerated.correlationId, 5000);
        expect(budgetStatus.status).toBe("SUCCESS");

        const transfer = (amount: string, key: string) =>
          transferExecution(
            { asset: "nep141:wrap.near", amount, recipient: "recipient.near", confidential: false },
            key,
          );
        await runExecution(
          actor,
          agentId,
          transfer(tokens(1.5), "budget-fit-0001"),
          credential.token,
        );
        const used = views.budgetView(await readBudget(actor, agentId));
        expect(used.daily?.limitUsd).toBe("2.00");
        expect(used.daily?.spentUsd).toBe("1.500000");
        expect(used.daily?.remainingUsd).toBe("0.500000");
        expect(used.daily?.resetsAt).toBeTruthy();

        const before = env.provider.state.submissions;
        await expect(
          runExecution(actor, agentId, transfer(tokens(0.6), "budget-over-0001"), credential.token),
        ).rejects.toMatchObject({ code: "spend_budget_exceeded", status: 403 });

        // The grant layer binds before the budget layer: a request that violates both names the
        // grant, and no spend is charged either way.
        await expect(
          runExecution(
            actor,
            agentId,
            transferExecution(
              {
                asset: "nep141:wrap.near",
                amount: "5",
                recipient: "untrusted.near",
                confidential: false,
              },
              "budget-order-0001",
            ),
            credential.token,
          ),
        ).rejects.toMatchObject({ code: "grant_recipient_denied", status: 403 });
        expect(env.provider.state.submissions).toBe(before);
        expect(views.budgetView(await readBudget(actor, agentId)).daily?.spentUsd).toBe("1.500000");
        expect(env.provider.state.submissions).toBe(before);
        expect(views.budgetView(await readBudget(actor, agentId)).daily?.spentUsd).toBe("1.500000");

        await runExecution(
          actor,
          agentId,
          transfer(tokens(0.5), "budget-exact-0001"),
          credential.token,
        );
        expect(views.budgetView(await readBudget(actor, agentId)).daily?.remainingUsd).toBe(
          "0.000000",
        );
      } finally {
        configurePrices(undefined);
      }
    } finally {
      await env.close();
    }
  });
});
