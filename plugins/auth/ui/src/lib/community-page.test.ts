import { describe, expect, it, vi } from "vitest";
import { communityPageForOrganization, communityPageHref } from "./community-page";

const organizationId = "org-1";

function client(overrides?: {
  tenant?: unknown;
  nodes?: unknown;
  discovery?: unknown;
  reject?: "tenant" | "nodes" | "discovery";
}) {
  return {
    resolveTenantByOrgId: vi.fn(async () => {
      if (overrides?.reject === "tenant") throw new Error("NOT_FOUND");
      return overrides?.tenant === undefined ? { id: "tenant-1" } : overrides.tenant;
    }),
    listNodes: vi.fn(async () => {
      if (overrides?.reject === "nodes") throw new Error("offline");
      return overrides?.nodes === undefined
        ? [{ id: "node-1", slug: "chicago", parentId: null, name: "Chicago" }]
        : overrides.nodes;
    }),
    getDiscoveryNode: vi.fn(async () => {
      if (overrides?.reject === "discovery") throw new Error("offline");
      return overrides?.discovery === undefined ? { nodeId: "node-1" } : overrides.discovery;
    }),
  };
}

describe("communityPageForOrganization", () => {
  it("returns the first node by name when the profile is public", async () => {
    const api = client({
      nodes: [
        { id: "node-z", slug: "zeta", parentId: null, name: "Zeta" },
        { id: "node-a", slug: "chicago", parentId: "parent-1", name: "Alpha" },
      ],
    });

    await expect(communityPageForOrganization(api, organizationId)).resolves.toEqual({
      slug: "chicago",
      parentId: "parent-1",
    });
  });

  it("returns null when the tenant lookup fails", async () => {
    await expect(
      communityPageForOrganization(client({ reject: "tenant" }), organizationId),
    ).resolves.toBeNull();
  });

  it("returns null when the tenant id is missing", async () => {
    await expect(
      communityPageForOrganization(client({ tenant: {} }), organizationId),
    ).resolves.toBeNull();
  });

  it("returns null when there are no nodes", async () => {
    await expect(
      communityPageForOrganization(client({ nodes: [] }), organizationId),
    ).resolves.toBeNull();
  });

  it("returns null when the first node is missing a slug", async () => {
    await expect(
      communityPageForOrganization(
        client({ nodes: [{ id: "node-1", parentId: null, name: "Chicago" }] }),
        organizationId,
      ),
    ).resolves.toBeNull();
  });

  it("returns null when getDiscoveryNode is null", async () => {
    await expect(
      communityPageForOrganization(client({ discovery: null }), organizationId),
    ).resolves.toBeNull();
  });

  it("returns null when a lookup throws", async () => {
    await expect(
      communityPageForOrganization(client({ reject: "nodes" }), organizationId),
    ).resolves.toBeNull();
  });
});

describe("communityPageHref", () => {
  it("includes parentId when the node has one", () => {
    expect(communityPageHref({ slug: "loop", parentId: "parent-1" })).toBe(
      "/n/loop?parentId=parent-1",
    );
    expect(communityPageHref({ slug: "chicago", parentId: null })).toBe("/n/chicago");
  });
});
