import { createHash } from "node:crypto";
import { ownerNep413SigningDigest } from "@near-intents-agent-api/relayer/owner-message";
import { describe, expect, it } from "vitest";

// The NEP-413 prehash: sha256(uint32le(2147484061) || len(msg) || msg || nonce || len(recipient) || recipient || 0x00)
const encodeString = (value: string) => {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
};

describe("vendored relayer — owner message digest", () => {
  it("computes the NEP-413 digest per the reference construction", () => {
    const nonce = new Uint8Array(32).fill(7);
    const message = "hello agent";
    const recipient = "v1.citynode.near";

    const expected = createHash("sha256")
      .update(
        Buffer.concat([
          (() => {
            const prefix = Buffer.alloc(4);
            prefix.writeUInt32LE(2147484061);
            return prefix;
          })(),
          encodeString(message),
          Buffer.from(nonce),
          encodeString(recipient),
          Buffer.from([0]),
        ]),
      )
      .digest();

    const digest = ownerNep413SigningDigest({ message, recipient, nonce });
    expect(Buffer.compare(digest, expected)).toBe(0);
  });

  it("refuses a nonce that is not 32 bytes", () => {
    expect(() =>
      ownerNep413SigningDigest({ message: "m", recipient: "r", nonce: new Uint8Array(31) }),
    ).toThrow("32 bytes");
  });
});
