import { describe, expect, it } from "vitest";
import {
  chooseDefaultValidator,
  getActiveOrganizationNodeId,
  getDirectoryNodes,
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
    const communities = [
      { node: { id: "node-1" }, viewerMembership: null },
      { node: { id: "node-2" }, viewerMembership: "active" as const },
    ];
    expect(
      getActiveOrganizationNodeId({
        activeOrganizationId: "org-1",
        communities,
        hasRequestedNode: false,
      }),
    ).toBe("node-2");
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

  it("keeps the directory when the viewer asks to browse every community", () => {
    expect(
      getActiveOrganizationNodeId({
        activeOrganizationId: "org-1",
        browseAll: true,
        communities: [{ node: { id: "node-1" }, viewerMembership: "active" }],
        hasRequestedNode: false,
      }),
    ).toBeNull();
  });

  it("keeps the directory when the active organization has no community", () => {
    expect(
      getActiveOrganizationNodeId({
        activeOrganizationId: "org-personal",
        communities: [
          { node: { id: "node-1" }, viewerMembership: null },
          { node: { id: "node-2" }, viewerMembership: "member" },
        ],
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

describe("getDirectoryNodes", () => {
  const community = (
    name: string,
    viewerMembership: "active" | "member" | null,
    stakeable: boolean,
    withNode = true,
  ) => ({
    name,
    hostname: `${name}.example.test`,
    stakeable,
    viewerMembership,
    node: withNode ? { id: `node-${name}`, slug: name, kind: "city" } : null,
  });

  it("lists the active community first, then other memberships, then the rest", () => {
    const nodes = getDirectoryNodes([
      community("alpha", null, true),
      community("bravo", "member", true),
      community("charlie", "active", false),
      community("delta", null, false),
      community("echo", "member", false),
    ]);
    expect(nodes.map((node) => node.slug)).toEqual(["charlie", "bravo", "echo", "alpha", "delta"]);
  });

  it("keeps the API order within a group when stakeability matches", () => {
    const nodes = getDirectoryNodes([
      community("alpha", "member", true),
      community("bravo", "member", true),
      community("charlie", null, true),
    ]);
    expect(nodes.map((node) => node.slug)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("skips communities without a node", () => {
    const nodes = getDirectoryNodes([
      community("alpha", "active", true, false),
      community("bravo", null, true),
    ]);
    expect(nodes).toEqual([
      {
        id: "node-bravo",
        name: "bravo",
        slug: "bravo",
        kind: "city",
        hostname: "bravo.example.test",
        stakeable: true,
      },
    ]);
  });
});
