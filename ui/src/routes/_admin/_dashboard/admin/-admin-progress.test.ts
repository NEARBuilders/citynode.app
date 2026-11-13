import { describe, expect, it } from "vitest";
import {
  APPLICATION_ITEMS_LIMIT,
  attendanceCoverage,
  buildCommunityProgressRows,
  deriveNeedsAction,
  eventHealth,
  type NeedsActionProposal,
  REPORT_CHASE_LIMIT,
  reportsToChase,
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
        communities: [{ node: { id: "a", name: "A" }, staking: "own" }],
      }),
    ).toEqual([]);
  });

  it("lists failed setups, applications, relayer funding and unstaked communities", () => {
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
        communities: [
          { node: { id: "berlin", name: "Berlin" }, staking: "none" },
          { node: { id: "austin", name: "Austin" }, staking: "inherited" },
        ],
      }),
    ).toEqual([
      { kind: "setup", proposal: setup },
      { kind: "application", proposal: pending },
      { kind: "relayer" },
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
        communities,
      }),
    ).toEqual([{ kind: "stakingMany", count: STAKING_ITEMS_LIMIT + 1 }]);
  });
});

describe("eventHealth", () => {
  const DAY = 24 * 3_600_000;
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  const communities = [
    { node: { id: "lisbon", name: "Lisbon" }, tenant: { orgId: "org-lisbon" } },
    { node: { id: "nairobi", name: "Nairobi" }, tenant: { orgId: "org-nairobi" } },
    { node: { id: "medellin", name: "Medellín" }, tenant: { orgId: "org-medellin" } },
  ];
  const held = (nodeId: string, days: number, reportSubmittedAt: string | null = null) => ({
    nodeId,
    organizationId: `org-${nodeId}`,
    startsAt: at(days),
    endsAt: at(days),
    reportSubmittedAt,
  });

  it("finds communities with nothing upcoming and nothing in the last 30 days", () => {
    const { quiet } = eventHealth({
      communities,
      now,
      events: [held("lisbon", 5), held("nairobi", -10, at(-9)), held("medellin", -45)],
    });
    expect(quiet).toEqual([{ nodeId: "medellin", name: "Medellín" }]);
  });

  it("counts recent events on any of a community's nodes", () => {
    const { quiet } = eventHealth({
      communities,
      now,
      events: [
        held("lisbon", 5),
        held("nairobi", -10),
        { ...held("medellin-north", -3), organizationId: "org-medellin" },
      ],
    });
    expect(quiet).toEqual([]);
  });

  it("chases reports missing more than a week after events from the last 90 days", () => {
    const { overdue, quiet } = eventHealth({
      communities,
      now,
      events: [
        held("lisbon", -3),
        held("lisbon", -10),
        held("nairobi", -20, at(-1)),
        held("medellin", -45),
        held("medellin", -95),
      ],
    });
    expect(overdue.map((event) => event.startsAt)).toEqual([at(-10), at(-45)]);
    expect(quiet.map((community) => community.nodeId)).toContain("medellin");
  });
});

describe("reportsToChase", () => {
  const harbor = { organizationId: "org-h", nodeId: "h", name: "Harbor", slug: "harbor" };
  const alder = { organizationId: "org-a", nodeId: "a", name: "Alder", slug: "alder" };

  it("chases each community for owed monthly reports and its overdue event reports", () => {
    const { chases, unattributed } = reportsToChase({
      now: Date.parse("2026-12-26T12:00:00.000Z"),
      monthly: [
        {
          month: "2026-12",
          communities: [
            { ...harbor, status: "missing" },
            { ...alder, status: "submitted" },
          ],
        },
        {
          month: "2026-11",
          communities: [
            { ...harbor, status: "missing" },
            { ...alder, status: "reviewed" },
          ],
        },
      ],
      overdue: [
        { organizationId: "org-a" },
        { organizationId: "org-a" },
        { organizationId: "org-platform" },
        { organizationId: null },
      ],
    });
    expect(chases).toEqual([
      { ...alder, months: [], overdueEvents: 2 },
      { ...harbor, months: ["2026-11", "2026-12"], overdueEvents: 0 },
    ]);
    expect(unattributed).toBe(2);
  });

  it("doesn't chase this month's report before its last week", () => {
    const { chases } = reportsToChase({
      now: Date.parse("2026-12-10T12:00:00.000Z"),
      monthly: [{ month: "2026-12", communities: [{ ...harbor, status: "missing" }] }],
      overdue: [],
    });
    expect(chases).toEqual([]);
  });
});

describe("community health in Needs action", () => {
  const base = {
    pendingReviewCount: 0,
    proposals: [],
    relayerNeedsFunding: false,
    organizationRequestCount: 0,
    communities: [],
  };

  it("lists one quiet community by name and folds several into one item", () => {
    expect(deriveNeedsAction({ ...base, quietCommunities: [{ nodeId: "a", name: "A" }] })).toEqual([
      { kind: "quiet", nodeId: "a", name: "A" },
    ]);
    expect(
      deriveNeedsAction({
        ...base,
        quietCommunities: [
          { nodeId: "a", name: "A" },
          { nodeId: "b", name: "B" },
        ],
      }),
    ).toEqual([{ kind: "quietMany", count: 2 }]);
  });

  it("adds one item for overdue reports", () => {
    expect(deriveNeedsAction({ ...base, overdueReports: 3 })).toEqual([
      { kind: "reportsOverdue", count: 3 },
    ]);
  });

  it("lists a community per missing report, folding the rest into one item", () => {
    const chase = (index: number) => ({
      organizationId: `org-${index}`,
      nodeId: `node-${index}`,
      name: `Community ${index}`,
      slug: `community-${index}`,
      months: ["2026-11"],
      overdueEvents: 0,
    });
    const chases = Array.from({ length: REPORT_CHASE_LIMIT + 2 }, (_, index) => chase(index));
    const items = deriveNeedsAction({ ...base, reportChases: chases, overdueReports: 1 });
    expect(items.map((item) => item.kind)).toEqual([
      ...chases.slice(0, REPORT_CHASE_LIMIT).map(() => "reportsMissing"),
      "reportsMissingMany",
      "reportsOverdue",
    ]);
    expect(items[REPORT_CHASE_LIMIT]).toEqual({
      kind: "reportsMissingMany",
      count: 2,
      month: "2026-11",
    });
  });
});

describe("attendanceCoverage", () => {
  it("counts the communities whose check-ins are synced, and those synced only partly", () => {
    const communities = [
      { tenant: { orgId: "org-a" } },
      { tenant: { orgId: "org-b" } },
      { tenant: { orgId: "org-c" } },
      { tenant: { orgId: null } },
    ];
    expect(
      attendanceCoverage(communities, [
        {
          organizationId: "org-a",
          checkIns: { syncedAt: "2026-11-01T00:00:00.000Z", partial: false },
        },
        {
          organizationId: "org-b",
          checkIns: { syncedAt: "2026-11-01T00:00:00.000Z", partial: true },
        },
        { organizationId: "org-c", checkIns: { syncedAt: null, partial: false } },
        {
          organizationId: "org-gone",
          checkIns: { syncedAt: "2026-11-01T00:00:00.000Z", partial: false },
        },
      ]),
    ).toEqual({ total: 3, synced: 2, partial: 1 });
  });
});
