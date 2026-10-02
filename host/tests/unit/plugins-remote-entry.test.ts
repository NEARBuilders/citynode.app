import { describe, expect, it } from "vitest";
import { remoteEntryUrlOf } from "../../src/services/plugins";

const appUrl = "http://localhost:4110/bundles/acct.test/gateway/apps";

describe("remoteEntryUrlOf", () => {
  it("uses the pin-derived hashed entry outside development", () => {
    expect(
      remoteEntryUrlOf(
        {
          name: "apps",
          url: appUrl,
          entry: "",
          source: "remote",
          entryUrl: `${appUrl}/remoteEntry.beef1234.js`,
        },
        "production",
        "plugins.apps",
      ),
    ).toBe(`${appUrl}/remoteEntry.beef1234.js`);
  });

  it("appends the fixed dev entry only in development", () => {
    expect(
      remoteEntryUrlOf(
        { name: "apps", url: appUrl, entry: "", source: "remote" },
        "development",
        "plugins.apps",
      ),
    ).toBe(`${appUrl}/remoteEntry.js`);
  });

  it("fails loudly in production when the slot has no derived entryUrl", () => {
    expect(() =>
      remoteEntryUrlOf(
        { name: "apps", url: appUrl, entry: "", source: "remote" },
        "production",
        "plugins.apps",
      ),
    ).toThrow(/plugins\.apps.*has no derived entryUrl/);
  });
});
