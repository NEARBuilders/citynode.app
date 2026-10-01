import {
  grantTokenPattern,
  ownerWalletSchema,
  policySchema,
} from "@near-intents-agent-api/contracts";
import { buildLlmsText, buildOpenApiDocument } from "@near-intents-agent-api/contracts/api";
import { describe, expect, it } from "vitest";

const validNearOwner = {
  type: "near",
  accountId: "v1.citynode.near",
  publicKey: "ed25519:8hmo5Y36doLTzDnSUjR3bXntLW6VFmPrHLbnL5hMwwCp",
};

describe("vendored contracts surface", () => {
  it("parses a NEAR owner wallet", () => {
    const parsed = ownerWalletSchema.parse(validNearOwner);
    expect(parsed.type).toBe("near");
  });

  it("rejects owner wallets with missing keys or oversized accounts", () => {
    expect(() =>
      ownerWalletSchema.parse({ type: "near", accountId: "v1.citynode.near" }),
    ).toThrow();
    expect(() =>
      ownerWalletSchema.parse({ ...validNearOwner, accountId: "x".repeat(65) }),
    ).toThrow();
  });

  it("matches grant tokens and rejects partner keys", () => {
    expect(grantTokenPattern.test(`ngt_${"A".repeat(43)}`)).toBe(true);
    expect(grantTokenPattern.test("ngt_short")).toBe(false);
    expect(grantTokenPattern.test(`naa_${"A".repeat(43)}`)).toBe(false);
  });

  it("policy rejects a wrong version and rejects missing required keys", () => {
    expect(policySchema.safeParse({ version: 2 }).success).toBe(false);
    expect(policySchema.safeParse({ version: 1, frozen: false }).success).toBe(false);
  });

  it("builds an OpenAPI document exposing the /v1 surface", () => {
    const doc = buildOpenApiDocument({ serverUrl: "https://agents.example" });
    expect(doc.openapi).toBeDefined();
    const paths = Object.keys((doc.paths as Record<string, unknown>) ?? {});
    expect(paths).toContain("/v1/generate-intent");
    expect(paths).toContain("/v1/submit-intent");
    expect(paths.some((p) => p.startsWith("/v1/agents/"))).toBe(true);
  });

  it("builds an llms.txt guide naming the intent flow", () => {
    const text = buildLlmsText({ serverUrl: "https://agents.example" });
    expect(text).toContain("generate-intent");
  });
});
