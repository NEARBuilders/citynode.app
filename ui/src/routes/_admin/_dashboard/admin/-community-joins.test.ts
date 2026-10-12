import { describe, expect, it } from "vitest";
import {
  buildCommunityJoinRows,
  COMMUNITY_JOINS_LIMIT,
  type JoinsTenant,
  visibleCommunityJoinRows,
} from "./-community-joins";

function tenant(overrides: Partial<JoinsTenant> & Pick<JoinsTenant, "id">): JoinsTenant {
  return {
    name: overrides.id,
    orgId: `org-${overrides.id}`,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function joins(entries: Record<string, number | [redeemed: number, newMembers: number]>) {
  return {
    organizations: Object.entries(entries).map(([organizationId, counts]) => {
      const [redeemed, newMembers] = typeof counts === "number" ? [counts, counts] : counts;
      return { organizationId, redeemed, newMembers };
    }),
  };
}

function counts(redeemed: number, newMembers: number) {
  return { redeemed, newMembers };
}

describe("buildCommunityJoinRows", () => {
  it("drops tenants pending deletion and keeps suspended ones", () => {
    const rows = buildCommunityJoinRows(
      [
        tenant({ id: "gone", status: "pending_deletion" }),
        tenant({ id: "paused", status: "suspended" }),
      ],
      joins({ "org-gone": 4, "org-paused": 1 }),
      undefined,
    );

    expect(rows.map((row) => row.tenant.id)).toEqual(["paused"]);
  });

  it("shows one row per organization, linked to its oldest tenant", () => {
    const rows = buildCommunityJoinRows(
      [
        tenant({ id: "newer", orgId: "org-shared", createdAt: "2026-03-01T00:00:00.000Z" }),
        tenant({ id: "older", orgId: "org-shared", createdAt: "2026-02-01T00:00:00.000Z" }),
        tenant({ id: "b-tie", orgId: "org-tied" }),
        tenant({ id: "a-tie", orgId: "org-tied" }),
      ],
      joins({ "org-shared": [3, 1], "org-tied": [2, 2] }),
      joins({ "org-shared": [1, 0] }),
    );

    expect(rows).toEqual([
      {
        tenant: expect.objectContaining({ id: "older" }),
        thisMonth: counts(3, 1),
        lastMonth: counts(1, 0),
      },
      {
        tenant: expect.objectContaining({ id: "a-tie" }),
        thisMonth: counts(2, 2),
        lastMonth: counts(0, 0),
      },
    ]);
  });

  it("does not let a pending-deletion tenant claim its organization's row", () => {
    const rows = buildCommunityJoinRows(
      [
        tenant({
          id: "old-deleting",
          orgId: "org-shared",
          status: "pending_deletion",
          createdAt: "2025-01-01T00:00:00.000Z",
        }),
        tenant({ id: "current", orgId: "org-shared" }),
      ],
      joins({ "org-shared": 5 }),
      undefined,
    );

    expect(rows.map((row) => row.tenant.id)).toEqual(["current"]);
  });

  it("zero-fills communities without redemptions and skips tenants without an organization", () => {
    const rows = buildCommunityJoinRows(
      [tenant({ id: "quiet" }), tenant({ id: "loose", orgId: null })],
      joins({ "org-elsewhere": 9 }),
      undefined,
    );

    expect(rows).toEqual([
      {
        tenant: expect.objectContaining({ id: "quiet" }),
        thisMonth: counts(0, 0),
        lastMonth: counts(0, 0),
      },
    ]);
  });

  it("caps the table to the top communities by redemptions this month until expanded", () => {
    const ids = Array.from({ length: COMMUNITY_JOINS_LIMIT + 2 }, (_, index) => `c${index}`);
    const rows = buildCommunityJoinRows(
      ids.map((id) => tenant({ id })),
      joins(
        Object.fromEntries(
          ids.map((id, index) => [`org-${id}`, [index, COMMUNITY_JOINS_LIMIT + 2 - index]]),
        ),
      ),
      undefined,
    );

    const capped = visibleCommunityJoinRows(rows, false);
    expect(capped.map((row) => row.thisMonth.redeemed)).toEqual(
      Array.from(
        { length: COMMUNITY_JOINS_LIMIT },
        (_, index) => COMMUNITY_JOINS_LIMIT + 1 - index,
      ),
    );
    expect(visibleCommunityJoinRows(rows, true)).toHaveLength(COMMUNITY_JOINS_LIMIT + 2);
  });
});
