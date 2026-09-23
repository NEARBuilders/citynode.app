import { p256 } from "@noble/curves/nist.js";
import { base58, base64, base64url, hex } from "@scure/base";
import { generateNonce } from "near-kit";
import { computeNep413Challenge } from "./passkey.js";

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;

interface AssertionParts {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}

function assertUserVerified(authenticatorData: Uint8Array): boolean {
  if (authenticatorData.length < 37) return false;
  const flags = authenticatorData[32]!;
  return (flags & FLAG_USER_PRESENT) !== 0 && (flags & FLAG_USER_VERIFIED) !== 0;
}

function toProof(assertion: AssertionParts): string {
  if (!assertUserVerified(assertion.authenticatorData)) {
    throw new Error("Passkey assertion is not user verified");
  }
  const rawSignature = assertion.signature;
  let signature: string;
  if (rawSignature.length > 64) {
    const parsed = p256.Signature.fromBytes(rawSignature, "der");
    const order = p256.Point.Fn.ORDER;
    const normalized =
      parsed.s * 2n > order ? new p256.Signature(parsed.r, order - parsed.s) : parsed;
    signature = `p256:${base58.encode(normalized.toBytes("compact"))}`;
  } else {
    signature = `ed25519:${base58.encode(rawSignature)}`;
  }
  const proof = JSON.stringify({
    authenticator_data: base64url.encode(assertion.authenticatorData),
    client_data_json: new TextDecoder().decode(assertion.clientDataJSON),
    signature,
  });
  return base64.encode(new TextEncoder().encode(proof));
}

/**
 * Signs the SIWN NEP-413 challenge with one of the signed-in user's
 * registered passkeys and links the derived deterministic `0s…` account.
 * The server verifies the assertion against the passkeys already stored
 * for the user — no public key ever crosses the wire.
 */
export async function linkPasskeyWallet(args: {
  recipient: string;
  listCredentialIds: () => Promise<string[]>;
  fetchLink: (body: { nonce: string; proof: string }) => Promise<{ accountId: string }>;
}): Promise<{ accountId: string }> {
  const message = `Sign in to ${args.recipient}`;
  const nonce = generateNonce();
  const nonceHex = hex.encode(nonce);
  const challenge = computeNep413Challenge(message, args.recipient, nonce);

  let credentialIds: string[] = [];
  try {
    credentialIds = await args.listCredentialIds();
  } catch {
    credentialIds = [];
  }

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: new Uint8Array(challenge),
      userVerification: "required",
      ...(credentialIds.length
        ? {
            allowCredentials: credentialIds.map((id) => ({
              id: new Uint8Array(base64url.decode(id)),
              type: "public-key" as const,
            })),
          }
        : {}),
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("No passkey assertion returned");

  const response = assertion.response as AuthenticatorAssertionResponse;
  const proof = toProof({
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  });

  return args.fetchLink({ nonce: nonceHex, proof });
}
