import { describe, expect, it } from "vitest";
import { organizationApproval } from "./organization-approval";

describe("organization approval", () => {
  it.each([
    [undefined, "active"],
    [null, "active"],
    ["active", "active"],
    ["pending", "pending"],
    ["rejected", "rejected"],
  ] as const)("reads status %s as %s, matching the server's approval check", (status, expected) => {
    expect(organizationApproval({ status })).toBe(expected);
  });
});
