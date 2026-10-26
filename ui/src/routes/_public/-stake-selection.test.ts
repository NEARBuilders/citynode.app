import { describe, expect, it } from "vitest";
import {
  chooseDefaultValidator,
  getActiveOrganizationNodeId,
  getStakeScopeKey,
} from "./-stake-selection";

describe("stake community selection", () => {
  it("uses the public scope for signed-out and anonymous visitors", () => {
    expect(getStakeScopeKey(null, null)).toBe("anonymous");
    expect(getStakeScopeKey({ id: "guest", isAnonymous: true }, null)).toBe("anonymous");
  });

  it("separates active organization and membership fallback caches", () => {
    expect(getStakeScopeKey({ id: "user-1" }, "org-1")).toBe("organization:org-1");
    expect(getStakeScopeKey({ id: "user-1" }, null)).toBe("user:user-1");
  });

  it("defaults only an unselected active organization to its community node", () => {
    const communities = [{ node: { id: "node-1" } }, { node: { id: "node-2" } }];
    expect(
      getActiveOrganizationNodeId({
        activeOrganizationId: "org-1",
        communities,
        hasRequestedNode: false,
      }),
    ).toBe("node-1");
    expect(
      getActiveOrganizationNodeId({
        activeOrganizationId: "org-1",
        communities,
        hasRequestedNode: true,
      }),
    ).toBeNull();
    expect(
      getActiveOrganizationNodeId({
        activeOrganizationId: null,
        communities,
        hasRequestedNode: false,
      }),
    ).toBeNull();
  });
});

describe("chooseDefaultValidator", () => {
  const pools = [
    { id: "default", isDefault: true },
    { id: "second", isDefault: false },
    { id: "third", isDefault: false },
  ];

  it("keeps the community's default when it is approved", () => {
    expect(chooseDefaultValidator(pools, new Set())?.id).toBe("default");
  });

  it("skips an unapproved default for the first approved pool", () => {
    expect(chooseDefaultValidator(pools, new Set(["default"]))?.id).toBe("second");
  });

  it("falls back to the default when no pool is approved", () => {
    expect(chooseDefaultValidator(pools, new Set(["default", "second", "third"]))?.id).toBe(
      "default",
    );
    expect(chooseDefaultValidator([], new Set())).toBeUndefined();
  });
});
