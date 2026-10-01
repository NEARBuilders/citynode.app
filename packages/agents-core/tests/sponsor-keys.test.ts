import { describe, expect, it } from "vitest";
import { sponsorKeysSchema } from "../src/config/sponsor-keys";

const validKey =
  "ed25519:51wkXZuAj4mUpd8GskACyNj5omyifyUEKGECqiVRviBzT4gTFAFAVD5jYcmMdFEHRcDLt2iktJ6irQtzpa8PBmso";

describe("sponsor key provisioning schema", () => {
  it("parses a single-key JSON array sharing one account", () => {
    const parsed = sponsorKeysSchema.parse(
      JSON.stringify([{ accountId: "sponsor.citynode.near", privateKey: validKey }]),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.accountId).toBe("sponsor.citynode.near");
  });

  it("rejects keys spread across multiple accounts", () => {
    const result = sponsorKeysSchema.safeParse(
      JSON.stringify([
        { accountId: "a.near", privateKey: validKey },
        { accountId: "b.near", privateKey: validKey },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a testnet sponsor account (account/network mismatch)", () => {
    const result = sponsorKeysSchema.safeParse(
      JSON.stringify([{ accountId: "sponsor.testnet", privateKey: validKey }]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects malformed JSON and duplicate keys", () => {
    expect(sponsorKeysSchema.safeParse("not json").success).toBe(false);
    expect(
      sponsorKeysSchema.safeParse(
        JSON.stringify([
          { accountId: "a.near", privateKey: validKey },
          { accountId: "a.near", privateKey: validKey },
        ]),
      ).success,
    ).toBe(false);
  });
});
