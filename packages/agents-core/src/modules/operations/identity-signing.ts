import {
  canonical,
  type IdentitySigningChallenge,
  identitySigningChallengeSchema,
  nearAccountSchema,
} from "@near-intents-agent-api/contracts";
import { ApiError } from "../../shared/errors.js";

const maxChallengeLifetimeMs = 5 * 60 * 1000;
const maxClockSkewMs = 30 * 1000;

/** Parse only the canonical, short-lived identity envelope accepted by detached sign routes. */
export function parseIdentitySigningMessage(
  message: string,
  expectedChain: IdentitySigningChallenge["chain"],
  expectedAudience?: string,
): IdentitySigningChallenge {
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    throw new ApiError("signing_identity_challenge_invalid", 400);
  }

  const parsed = identitySigningChallengeSchema.safeParse(value);
  if (!parsed.success) throw new ApiError("signing_identity_challenge_invalid", 400);
  const challenge = parsed.data;
  const now = Date.now();
  if (
    canonical(challenge) !== message ||
    challenge.chain !== expectedChain ||
    (expectedAudience !== undefined && challenge.audience !== expectedAudience) ||
    challenge.expires_at_ms <= challenge.issued_at_ms ||
    challenge.expires_at_ms <= now ||
    challenge.issued_at_ms > now + maxClockSkewMs ||
    challenge.expires_at_ms - challenge.issued_at_ms > maxChallengeLifetimeMs ||
    challenge.expires_at_ms - now > maxChallengeLifetimeMs ||
    !isAllowedAudience(challenge)
  )
    throw new ApiError("signing_identity_challenge_invalid", 400);

  return challenge;
}

function isAllowedAudience(challenge: IdentitySigningChallenge): boolean {
  if (challenge.chain === "near") return nearAccountSchema.safeParse(challenge.audience).success;

  try {
    const audience = new URL(challenge.audience);
    return (
      audience.protocol === "https:" &&
      audience.origin === challenge.audience &&
      audience.username === "" &&
      audience.password === ""
    );
  } catch {
    return false;
  }
}
