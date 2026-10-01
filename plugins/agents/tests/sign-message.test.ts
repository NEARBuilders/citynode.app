import { randomBytes } from "node:crypto";
import {
  generateIntent,
  generateResponse,
  readStatus,
  signMessage,
  submitIntent,
} from "@near-intents-agent-api/agents-core";
import {
  canonical,
  identitySigningChallengeSchema,
  policySchema,
} from "@near-intents-agent-api/contracts";
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
    sign_message: {
      allowed: true,
      requires_approval: false,
      allowed_recipients: ["recipient.near"],
    },
    swap: { allowed: false, requires_approval: false },
  },
  rules: { allowed_tokens: ["native"], transaction_types: ["transfer"] },
});

function identityMessage(audience: string) {
  const issuedAtMs = Date.now();
  return canonical(
    identitySigningChallengeSchema.parse({
      domain: "near-intents-agent-api.identity.v1",
      purpose: "identity",
      chain: "near",
      audience,
      challenge: randomBytes(32).toString("hex"),
      issued_at_ms: issuedAtMs,
      expires_at_ms: issuedAtMs + 60_000,
    }),
  );
}

async function onboardAndGrant(env: Awaited<ReturnType<typeof setupCore>>) {
  const actor = await env.actor();
  const { owner, signer } = nearOwnerFixture();
  const created = await generateIntent(actor, {
    type: "agent_create",
    name: "Signer",
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
    label: "Signing assistant",
    credential: credential.commitment,
    actions: ["sign:near_message"],
    signingAudiences: ["recipient.near"],
    recipients: testDestinations(["recipient.near"]),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const grantGenerated = generateResponse(grantIntent.row);
  await submitIntent(actor, {
    type: "grant_issue",
    correlationId: grantGenerated.correlationId,
    signedData: signer.sign(grantGenerated.intent),
  });
  const status = await readStatus(actor, grantGenerated.correlationId, 5000);
  expect(status.status).toBe("SUCCESS");
  return { actor, agentId: generated.agentId, token: credential.token };
}

describe("grant-scoped message signing (ticket 11 tail)", () => {
  it("signs an identity challenge under a sign-grant and refuses unlisted audiences", async () => {
    const env = await setupCore("grant-sign");
    try {
      const { actor, agentId, token } = await onboardAndGrant(env);
      const callsBefore = env.provider.state.nearMessageCalls;
      const signed = await signMessage(
        actor,
        agentId,
        {
          message: identityMessage("recipient.near"),
          encoding: "utf8",
          recipient: "recipient.near",
          idempotencyKey: "grant-sign-ok-0001",
        },
        token,
      );
      expect(signed.status).toBe("completed");
      expect(env.provider.state.nearMessageCalls).toBe(callsBefore + 1);

      await expect(
        signMessage(
          actor,
          agentId,
          {
            message: identityMessage("untrusted.near"),
            encoding: "utf8",
            recipient: "untrusted.near",
            idempotencyKey: "grant-sign-audience-0001",
          },
          token,
        ),
      ).rejects.toMatchObject({ code: "grant_recipient_denied", status: 403 });

      await expect(
        signMessage(
          actor,
          agentId,
          {
            message: "approve transfer",
            encoding: "utf8",
            recipient: "recipient.near",
            idempotencyKey: "grant-sign-arbitrary-0001",
          },
          token,
        ),
      ).rejects.toMatchObject({ code: "signing_identity_challenge_invalid" });

      expect(env.provider.state.nearMessageCalls).toBe(callsBefore + 1);
    } finally {
      await env.close();
    }
  });
});
