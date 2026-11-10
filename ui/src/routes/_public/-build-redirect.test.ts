import { describe, expect, it } from "vitest";
import { memberBuildUrl, nearBuildersBuildUrl } from "./-build-destination";

describe("nearBuildersBuildUrl", () => {
  it("adds the referral code as ref", () => {
    expect(nearBuildersBuildUrl("abc123")).toBe("https://nearbuilders.org/build?ref=abc123");
  });

  it("encodes the code", () => {
    expect(nearBuildersBuildUrl("a b&c")).toBe("https://nearbuilders.org/build?ref=a+b%26c");
  });

  it("leaves the code off when there is none", () => {
    expect(nearBuildersBuildUrl(null)).toBe("https://nearbuilders.org/build");
    expect(nearBuildersBuildUrl("  ")).toBe("https://nearbuilders.org/build");
  });
});

describe("memberBuildUrl", () => {
  it("uses the member's own referral code", async () => {
    const lookup = async () => ({ data: { code: "abc123" }, error: null });
    await expect(memberBuildUrl(lookup)).resolves.toBe("https://nearbuilders.org/build?ref=abc123");
  });

  it("goes without a code when the lookup returns an error", async () => {
    const lookup = async () => ({ data: null, error: { status: 401 } });
    await expect(memberBuildUrl(lookup)).resolves.toBe("https://nearbuilders.org/build");
  });

  it("goes without a code when the lookup throws", async () => {
    const lookup = async () => {
      throw new Error("network");
    };
    await expect(memberBuildUrl(lookup)).resolves.toBe("https://nearbuilders.org/build");
  });
});
