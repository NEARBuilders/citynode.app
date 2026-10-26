import { describe, expect, it } from "vitest";
import {
  communityAttention,
  communityJoinsState,
  progressState,
  splitCommunityEvents,
} from "./-community-progress";

const now = Date.parse("2026-10-26T12:00:00Z");

function event(id: string, startsAt: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: "event",
    status: "published",
    startsAt,
    endsAt: startsAt,
    ...overrides,
  };
}

describe("community events", () => {
  it("splits published events into upcoming and past", () => {
    const { upcoming, past } = splitCommunityEvents(
      [
        event("later", "2026-11-20T18:00:00Z"),
        event("soon", "2026-10-30T18:00:00Z"),
        event("old", "2026-09-01T18:00:00Z"),
        event("older", "2026-08-01T18:00:00Z"),
        event("tba", null),
      ],
      now,
    );
    expect(upcoming.map((e) => e.id)).toEqual(["soon", "later", "tba"]);
    expect(past.map((e) => e.id)).toEqual(["old", "older"]);
  });

  it("keeps an event upcoming until it ends", () => {
    const running = event("running", "2026-10-26T10:00:00Z", { endsAt: "2026-10-26T14:00:00Z" });
    expect(splitCommunityEvents([running], now).upcoming).toHaveLength(1);
  });

  it("ignores drafts, cancelled events and social posts", () => {
    const { upcoming, past } = splitCommunityEvents(
      [
        event("draft", "2026-11-01T18:00:00Z", { status: "draft" }),
        event("cancelled", "2026-11-01T18:00:00Z", { status: "cancelled" }),
        event("post", "2026-11-01T18:00:00Z", { kind: "social" }),
      ],
      now,
    );
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });
});

describe("community stat states", () => {
  const ready = <T>(data: T) => ({ isPending: false, isError: false, data });
  const loading = { isPending: true, isError: false, data: undefined };
  const failed = { isPending: false, isError: true, data: undefined };

  it("reports errors as errors instead of zero", () => {
    expect(progressState(failed, () => 0)).toEqual({ status: "error" });
  });

  it("reports loading and unavailable states", () => {
    expect(progressState(loading, () => 0)).toEqual({ status: "loading" });
    expect(progressState(null, () => 0)).toEqual({ status: "unavailable" });
  });

  it("selects the value once loaded", () => {
    expect(progressState(ready([1, 2, 3]), (rows) => rows.length)).toEqual({
      status: "ready",
      value: 3,
    });
  });

  it("needs a site and an organization before joins can load", () => {
    const joins = ready({ redeemed: 4 });
    expect(communityJoinsState({ hasSite: false, tenant: loading, joins })).toEqual({
      status: "unavailable",
    });
    expect(communityJoinsState({ hasSite: true, tenant: ready({ orgId: null }), joins })).toEqual({
      status: "unavailable",
    });
    expect(communityJoinsState({ hasSite: true, tenant: ready(null), joins })).toEqual({
      status: "unavailable",
    });
  });

  it("shows a site lookup failure as a joins error", () => {
    expect(communityJoinsState({ hasSite: true, tenant: failed, joins: loading })).toEqual({
      status: "error",
    });
    expect(communityJoinsState({ hasSite: true, tenant: loading, joins: loading })).toEqual({
      status: "loading",
    });
  });

  it("passes the joins query through once the organization is known", () => {
    const tenant = ready({ orgId: "org-1" });
    expect(communityJoinsState({ hasSite: true, tenant, joins: failed })).toEqual({
      status: "error",
    });
    expect(communityJoinsState({ hasSite: true, tenant, joins: ready({ redeemed: 4 }) })).toEqual({
      status: "ready",
      value: { redeemed: 4 },
    });
  });
});

describe("community attention", () => {
  const healthy = {
    hasSite: true,
    tenant: { status: "active", orgId: "org-1" },
    stakingValidators: 2,
    upcomingEvents: 1,
  };

  it("is empty for a healthy community", () => {
    expect(communityAttention(healthy)).toEqual([]);
  });

  it("lists what needs an admin", () => {
    expect(
      communityAttention({
        hasSite: true,
        tenant: { status: "pending", orgId: null },
        stakingValidators: 0,
        upcomingEvents: 0,
      }),
    ).toEqual(["noOrganization", "sitePending", "noStaking", "noUpcomingEvents"]);
    expect(communityAttention({ ...healthy, tenant: { status: "suspended", orgId: "o" } })).toEqual(
      ["siteSuspended"],
    );
    expect(communityAttention({ ...healthy, hasSite: false, tenant: null })).toEqual(["noSite"]);
  });

  it("does not flag events while they are still loading", () => {
    expect(communityAttention({ ...healthy, upcomingEvents: undefined })).toEqual([]);
  });
});
