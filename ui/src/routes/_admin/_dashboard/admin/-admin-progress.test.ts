import { describe, expect, it } from "vitest";
import {
  APPLICATION_ITEMS_LIMIT,
  buildCommunityProgressRows,
  deriveNeedsAction,
  type NeedsActionProposal,
  STAKING_ITEMS_LIMIT,
  stakingStates,
} from "./-admin-progress";

function summary(id: string, parentId: string | null, validatorCount = 0, tenantId?: string) {
  return { node: { id, name: id, parentId, tenantId: tenantId ?? null }, validatorCount };
}

function tenant(id: string, orgId: string | null, status = "active") {
  return { id, name: id, orgId, status, createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("stakingStates", () => {
  it("separates own, below, inherited and missing validators", () => {
    const states = stakingStates([
      summary("usa", null, 1),
      summary("chicago", "usa"),
      summary("pakistan", null),
      summary("lahore", "pakistan", 2),
      summary("berlin", null),
    ]);
    expect(Object.fromEntries(states)).toEqual({
      usa: "own",
      chicago: "inherited",
      pakistan: "below",
      lahore: "own",
      berlin: "none",
    });
  });

  it("survives a parent cycle", () => {
    const states = stakingStates([summary("a", "b"), summary("b", "a")]);
    expect(states.get("a")).toBe("none");
  });
});

describe("buildCommunityProgressRows", () => {
  it("joins tenants, monthly joins and event counts per community node", () => {
    const rows = buildCommunityProgressRows(
      [tenant("t-chicago", "org-chicago"), tenant("t-gone", "org-gone", "pending_deletion")],
      [
        summary("usa", null, 1),
        summary("chicago", "usa", 0, "t-chicago"),
        summary("gone", null, 0, "t-gone"),
      ],
      { organizations: [{ organizationId: "org-chicago", redeemed: 6, newMembers: 4 }] },
      [{ nodeId: "chicago", upcoming: 2, past: 3, lastActivityAt: "2026-10-20T00:00:00.000Z" }],
    );
    expect(rows).toEqual([
      {
        node: { id: "chicago", name: "chicago", parentId: "usa", tenantId: "t-chicago" },
        tenant: tenant("t-chicago", "org-chicago"),
        joins: { redeemed: 6, newMembers: 4 },
        events: { upcoming: 2, past: 3 },
        lastActivityAt: "2026-10-20T00:00:00.000Z",
        staking: "inherited",
      },
    ]);
  });

  it("reports a site once, on its top-most community", () => {
    const rows = buildCommunityProgressRows(
      [tenant("t1", "org-1")],
      [
        summary("a-city", "z-country", 0, "t1"),
        summary("z-country", null, 0, "t1"),
        summary("b-district", "a-city", 0, "t1"),
      ],
      undefined,
      [],
    );
    expect(rows.map((row) => row.node.id)).toEqual(["z-country"]);
  });

  it("gives each site its own row but counts an organization's joins once", () => {
    const rows = buildCommunityProgressRows(
      [
        { ...tenant("t-old", "org-1"), createdAt: "2025-01-01T00:00:00.000Z" },
        { ...tenant("t-new", "org-1"), createdAt: "2026-05-01T00:00:00.000Z" },
      ],
      [summary("city", null, 1, "t-old"), summary("other", null, 0, "t-new")],
      { organizations: [{ organizationId: "org-1", redeemed: 12, newMembers: 5 }] },
      [],
    );
    expect(rows.map((row) => [row.node.id, row.tenant.id, row.joins, row.staking])).toEqual([
      ["city", "t-old", { redeemed: 12, newMembers: 5 }, "own"],
      ["other", "t-new", null, "none"],
    ]);
  });

  it("keeps a community with no activity, showing no joins for a site without an organization", () => {
    const [row] = buildCommunityProgressRows(
      [tenant("t-berlin", null)],
      [summary("berlin", null, 0, "t-berlin")],
      undefined,
      [],
    );
    expect(row).toMatchObject({
      joins: null,
      events: { upcoming: 0, past: 0 },
      staking: "none",
    });
  });
});

describe("deriveNeedsAction", () => {
  const setup: NeedsActionProposal = {
    id: "p1",
    pluginId: "node",
    entityId: "karachi",
    reviewStatus: "approved" as const,
    title: "Karachi",
    createdAt: "2026-10-20T00:00:00.000Z",
    setupNeedsAttention: true,
  };

  it("returns nothing when every source is clear", () => {
    expect(
      deriveNeedsAction({
        pendingReviewCount: 0,
        proposals: [],
        relayerNeedsFunding: false,
        organizationRequestCount: 0,
        communities: [{ node: { id: "a", name: "A" }, staking: "own" }],
      }),
    ).toEqual([]);
  });

  it("lists failed setups, applications, relayer funding, organization requests and unstaked communities", () => {
    const pending = {
      ...setup,
      id: "p2",
      reviewStatus: "pending" as const,
      setupNeedsAttention: false,
    };
    expect(
      deriveNeedsAction({
        pendingReviewCount: 1,
        proposals: [setup, pending],
        relayerNeedsFunding: true,
        organizationRequestCount: 1,
        communities: [
          { node: { id: "berlin", name: "Berlin" }, staking: "none" },
          { node: { id: "austin", name: "Austin" }, staking: "inherited" },
        ],
      }),
    ).toEqual([
      { kind: "setup", proposal: setup },
      { kind: "application", proposal: pending },
      { kind: "relayer" },
      { kind: "organizations", count: 1 },
      { kind: "staking", nodeId: "berlin", name: "Berlin" },
    ]);
  });

  it("lists the first applications and counts the rest", () => {
    const pending = Array.from({ length: APPLICATION_ITEMS_LIMIT + 2 }, (_, index) => ({
      ...setup,
      id: `p${index}`,
      reviewStatus: "pending" as const,
      setupNeedsAttention: false,
    }));
    const items = deriveNeedsAction({
      pendingReviewCount: APPLICATION_ITEMS_LIMIT + 4,
      proposals: pending,
      relayerNeedsFunding: false,
      organizationRequestCount: 0,
      communities: [],
    });
    expect(items.filter((item) => item.kind === "application")).toHaveLength(
      APPLICATION_ITEMS_LIMIT,
    );
    expect(items.at(-1)).toEqual({ kind: "moreApplications", count: 4 });
  });

  it("folds many unstaked communities into one item", () => {
    const communities = Array.from({ length: STAKING_ITEMS_LIMIT + 1 }, (_, index) => ({
      node: { id: `n${index}`, name: `N${index}` },
      staking: "none" as const,
    }));
    expect(
      deriveNeedsAction({
        pendingReviewCount: 0,
        proposals: [],
        relayerNeedsFunding: false,
        organizationRequestCount: 0,
        communities,
      }),
    ).toEqual([{ kind: "stakingMany", count: STAKING_ITEMS_LIMIT + 1 }]);
  });
});
