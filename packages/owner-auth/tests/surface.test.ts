import { generateKeyPairSync } from "node:crypto";
import {
  deriveEvmWallet,
  derivePasskeyWallet,
  evmAddressFromPublicKey,
} from "@near-intents-agent-api/owner-auth";
import { describe, expect, it } from "vitest";

function p256SpkiBase64Url(): string {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return publicKey.export({ format: "der", type: "spki" }).toString("base64url");
}

function ed25519SpkiBase64Url(): string {
  const { publicKey } = generateKeyPairSync("ed25519");
  return publicKey.export({ format: "der", type: "spki" }).toString("base64url");
}

function evmPublicKeyHex(): string {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  const raw = publicKey.export({ format: "der", type: "spki" });
  // uncompressed point: the final 65 bytes are 0x04 || X (32) || Y (32)
  const uncompressed = raw.subarray(raw.length - 65);
  return `0x${uncompressed.subarray(1).toString("hex")}`;
}

describe("vendored owner-auth wallet derivation", () => {
  it("derives a stable NEP-616 0s account from a passkey SPKI key", () => {
    const spki = p256SpkiBase64Url();
    const a = derivePasskeyWallet(spki);
    const b = derivePasskeyWallet(spki);
    expect(a.accountId).toBe(b.accountId);
    expect(a.accountId.startsWith("0s")).toBe(true);
  });

  it("derives different passkey accounts from different keys", () => {
    const a = derivePasskeyWallet(p256SpkiBase64Url());
    const b = derivePasskeyWallet(p256SpkiBase64Url());
    expect(a.accountId).not.toBe(b.accountId);
  });

  it("refuses non-P-256 passkey material with the protocol error", () => {
    expect(() => derivePasskeyWallet(ed25519SpkiBase64Url())).toThrow(
      "passkey_algorithm_unsupported",
    );
  });

  it("derives a deterministic 0s account from an EVM key, distinct from the keccak address", () => {
    const publicKeyHex = evmPublicKeyHex();
    const wallet = deriveEvmWallet(publicKeyHex);
    expect(wallet.accountId).toMatch(/^0s[0-9a-f]{40}$/);
    expect(evmAddressFromPublicKey(publicKeyHex)).toMatch(/^0x[0-9a-f]{40}$/);
    expect(deriveEvmWallet(publicKeyHex).accountId).toBe(wallet.accountId);
  });

  it("refuses malformed EVM public keys", () => {
    expect(() => deriveEvmWallet("0x1234")).toThrow("evm_public_key_invalid");
  });
});
