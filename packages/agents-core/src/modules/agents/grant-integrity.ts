import { agentGrantMessageSchema, canonical } from "@near-intents-agent-api/contracts";
import type { agentGrants } from "@near-intents-agent-api/database";

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/**
 * Authorization reads a grant's permission columns, so they must restate the owner-signed message
 * they were copied from at issuance. This detects inconsistent edits, but a database writer can
 * change both columns and message. It does not re-verify the owner's proof.
 */
export function grantRestatesOwnerMessage(grant: typeof agentGrants.$inferSelect): boolean {
  const parsed = agentGrantMessageSchema.safeParse(grant.ownerMessage);
  if (!parsed.success) return false;
  const message = parsed.data;
  return (
    message.tenant_id === grant.tenantId &&
    message.agent_id === grant.agentId &&
    message.wallet_id === grant.walletId &&
    message.label === grant.label &&
    message.credential === grant.credentialHash &&
    message.owner_epoch === grant.ownerEpoch &&
    message.issued_at_ms === grant.issuedAt.getTime() &&
    message.expires_at_ms === grant.expiresAt.getTime() &&
    sameList(message.actions, grant.actions) &&
    canonical(message.recipients) === canonical(grant.recipients) &&
    sameList(message.signing_audiences, grant.signingAudiences)
  );
}
