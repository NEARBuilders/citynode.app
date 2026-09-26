import { describe, expect, it } from "vitest";
import { initialsFor } from "./curate-team";
import { needsAttention } from "./discover";

describe("curate", () => {
  it("flags communities missing a description, a join link, or recent activity", () => {
    const healthy = { summary: "Hi", channels: [{ label: "x", url: "https://x.y" }], active: true };
    expect(needsAttention(healthy)).toBe(false);
    expect(needsAttention({ ...healthy, summary: "" })).toBe(true);
    expect(needsAttention({ ...healthy, channels: [] })).toBe(true);
    expect(needsAttention({ ...healthy, active: false })).toBe(true);
  });

  it("builds avatar initials from a name, falling back to the account id", () => {
    expect(initialsFor("Ada Lovelace", "id")).toBe("AL");
    expect(initialsFor(null, "zb94")).toBe("ZB");
  });
});
