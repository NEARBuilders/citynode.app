import { randomBytes } from "node:crypto";
import {
  acknowledgeSigningArtifact,
  generateIntent,
  generateResponse,
  readSigningArtifact,
  readStatus,
  signMessage,
  submitIntent,
} from "@near-intents-agent-api/agents-core";
import {
  canonical,
  identitySigningChallengeSchema,
  policySchema,
} from "@near-intents-agent-api/contracts";
import { operationArtifacts, operations } from "@near-intents-agent-api/database";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupCore } from "./support/core-setup";
import { createGrantCredential } from "./support/grant-credential";
import { testDestinations } from "./support/grant-destinations";
import { type IntentSigner, nearOwnerFixture } from "./support/intent-signers";

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
    swap: { allowed: true, requires_approval: false },
  },
  rules: { allowed_tokens: ["native"], transaction_types: ["transfer", "swap"] },
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

type Env = Awaited<ReturnType<typeof setupCore>>;

async function onboard(env: Env, name: string) {
  const actor = await env.actor();
  const { owner, signer } = nearOwnerFixture();
  const created = await generateIntent(actor, {
    type: "agent_create",
    name,
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
  return { actor, agentId: generated.agentId, signer };
}

async function issueGrant(
  actor: Awaited<ReturnType<Env["actor"]>>,
  agentId: string,
  signer: IntentSigner,
  actions: string[],
  label: string,
): Promise<string> {
  const credential = createGrantCredential();
  const intent = await generateIntent(actor, {
    type: "grant_issue",
    agentId,
    label,
    credential: credential.commitment,
    actions,
    signingAudiences: actions.includes("sign:near_message") ? ["recipient.near"] : [],
    recipients: testDestinations(["recipient.near"]),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const generated = generateResponse(intent.row);
  await submitIntent(actor, {
    type: "grant_issue",
    correlationId: generated.correlationId,
    signedData: signer.sign(generated.intent),
  });
  const status = await readStatus(actor, generated.correlationId, 5000);
  expect(status.status).toBe("SUCCESS");
  return credential.token;
}

describe("signature delivery (getSignature / acknowledgeSignature)", () => {
  it("delivers the artifact once to the authorizing grant, erases on acknowledge", async () => {
    const env = await setupCore("signature-delivery");
    try {
      const { actor, agentId, signer } = await onboard(env, "Signer");
      const signingToken = await issueGrant(
        actor,
        agentId,
        signer,
        ["sign:near_message"],
        "Signer grant",
      );

      const signed = await signMessage(
        actor,
        agentId,
        {
          message: identityMessage("recipient.near"),
          encoding: "utf8",
          recipient: "recipient.near",
          idempotencyKey: "delivery-ok-0001",
        },
        signingToken,
      );
      expect(signed.status).toBe("completed");
      const correlationId = signed.id;

      const delivery = await readSigningArtifact(actor, agentId, correlationId, signingToken);
      expect(delivery.operation_id).toBe(correlationId);
      expect(delivery.artifact).toMatchObject({
        near_account_id: expect.any(String),
        recipient: "recipient.near",
        public_key: expect.stringMatching(/^ed25519:/),
        signature: expect.stringMatching(/^[0-9a-f]{128}$/),
      });

      // The signature lives only in the encrypted artifact: the stored
      // operation result is redacted and the ciphertext excludes the secret.
      const [storedOperation] = await env.database.db
        .select({ result: operations.result })
        .from(operations)
        .where(and(eq(operations.agentId, agentId), eq(operations.id, correlationId)));
      expect(storedOperation?.result).toEqual({
        redacted: true,
        artifact_redacted: true,
        status: "completed",
      });
      const [storedArtifact] = await env.database.db
        .select()
        .from(operationArtifacts)
        .where(eq(operationArtifacts.operationId, correlationId));
      expect(storedArtifact?.ciphertext).toBeTruthy();
      expect(storedArtifact?.ciphertext).not.toContain(delivery.artifact.signature);
      expect(storedArtifact?.grantId).toBeTruthy();

      // A different sign-grant's token cannot collect it, a non-signing
      // grant cannot either, and neither can an absent token.
      const siblingToken = await issueGrant(
        actor,
        agentId,
        signer,
        ["sign:near_message"],
        "Sibling signer grant",
      );
      await expect(
        readSigningArtifact(actor, agentId, correlationId, siblingToken),
      ).rejects.toMatchObject({ code: "signing_artifact_not_found", status: 404 });
      const swapToken = await issueGrant(actor, agentId, signer, ["swap"], "Swap grant");
      await expect(
        readSigningArtifact(actor, agentId, correlationId, swapToken),
      ).rejects.toMatchObject({ code: "signing_artifact_not_found", status: 404 });
      await expect(
        readSigningArtifact(actor, agentId, correlationId, undefined),
      ).rejects.toMatchObject({ code: "signing_artifact_not_found", status: 404 });

      // The authorizing token reads twice (delivery is one-time per READ of
      // the live artifact; the ERASE is the acknowledge step).
      const again = await readSigningArtifact(actor, agentId, correlationId, signingToken);
      expect(again.artifact.signature).toBe(delivery.artifact.signature);

      // Acknowledge erases: a further read is consumed (410), the ack stays
      // idempotent.
      await expect(
        acknowledgeSigningArtifact(actor, agentId, correlationId, signingToken),
      ).resolves.toEqual({ acknowledged: true });
      await expect(
        readSigningArtifact(actor, agentId, correlationId, signingToken),
      ).rejects.toMatchObject({ code: "signing_artifact_consumed", status: 410 });
      await expect(
        acknowledgeSigningArtifact(actor, agentId, correlationId, signingToken),
      ).resolves.toEqual({ acknowledged: true });

      const [erased] = await env.database.db
        .select()
        .from(operationArtifacts)
        .where(eq(operationArtifacts.operationId, correlationId));
      expect(erased?.ciphertext).toBeNull();
      expect(erased?.consumedAt).not.toBeNull();
    } finally {
      await env.close();
    }
  });

  it("answers not-found for unknown operations and refuses foreign tenants", async () => {
    const env = await setupCore("signature-delivery-missing");
    try {
      const { actor, agentId, signer } = await onboard(env, "Missing");
      const signingToken = await issueGrant(
        actor,
        agentId,
        signer,
        ["sign:near_message"],
        "Signer grant",
      );

      await expect(
        readSigningArtifact(actor, agentId, "0".repeat(64), signingToken),
      ).rejects.toMatchObject({ code: "signing_artifact_not_found", status: 404 });
      await expect(
        acknowledgeSigningArtifact(actor, agentId, "0".repeat(64), signingToken),
      ).rejects.toMatchObject({ code: "signing_artifact_not_found", status: 404 });
    } finally {
      await env.close();
    }
  });
});
