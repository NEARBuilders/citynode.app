import type { Intent, SignedData } from "@near-intents-agent-api/contracts/api";
import type { AuthClient } from "everything-dev/ui/auth";

/**
 * A new grant token and the commitment the owner signs for it (upstream SDK
 * scheme): SHA-256 hex of the token, kept client-side — the server only ever
 * sees the commitment.
 */
export type GrantCredential = { token: string; commitment: string };

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `ngt_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export async function createGrantCredential(): Promise<GrantCredential> {
  const token = randomToken();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const commitment = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { token, commitment };
}

function nonceBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Sign a generated intent with the session's connected wallet, exactly as
 * the payload prescribes: NEP-366 policy intents sign as a delegate action
 * (`buildSignedDelegateAction`), NEP-413 consent intents as a NEP-413
 * message (`Near.signMessage`, wallet-routed).
 */
export async function signIntent(authClient: AuthClient, intent: Intent): Promise<SignedData> {
  if (intent.standard === "nep366") {
    const signedDelegate = await authClient.near.buildSignedDelegateAction(
      intent.payload.receiverId,
      (builder, receiverId) => {
        let next = builder;
        for (const action of intent.payload.actions) {
          next = next.functionCall(receiverId, action.params.methodName, action.params.args, {
            gas: action.params.gas as `${number}`,
            attachedDeposit: BigInt(action.params.deposit),
          });
        }
        return next;
      },
    );
    return { standard: "nep366", payload: intent.payload, signedDelegate };
  }
  if (intent.standard === "nep413") {
    const nearClient = authClient.near.getNearClient();
    const signed = await nearClient.signMessage({
      message: intent.payload.message,
      recipient: intent.payload.recipient,
      nonce: nonceBytes(intent.payload.nonce),
    });
    return {
      standard: "nep413",
      payload: intent.payload,
      public_key: signed.publicKey,
      signature: signed.signature,
    };
  }
  throw new Error(`Signing standard not supported in this client: ${intent.standard}`);
}

// ---------------------------------------------------------------------------------------------
// Grant-token storage: the token never travels except as the x-grant-token
// header. Keys are per agent + grant label — one label, one live token.
// ---------------------------------------------------------------------------------------------

const STORAGE_PREFIX = "agents-grant-tokens:";

function readTokens(agentId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + agentId);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeTokens(agentId: string, tokens: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + agentId, JSON.stringify(tokens));
  } catch {
    // storage unavailable (private mode) — the token lives only in this session
  }
}

export function storedGrantLabels(agentId: string): string[] {
  return Object.keys(readTokens(agentId));
}

export function storedToken(agentId: string, label: string): string | null {
  return readTokens(agentId)[label] ?? null;
}

export function storeToken(agentId: string, label: string, token: string): void {
  writeTokens(agentId, { ...readTokens(agentId), [label]: token });
}

export function forgetToken(agentId: string, label: string): void {
  const tokens = readTokens(agentId);
  delete tokens[label];
  writeTokens(agentId, tokens);
}
