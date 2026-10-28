import { describe, expect, it } from "vitest";
import {
  communityOrganizationId,
  isPersonalOrganization,
  resolveCommunityMembership,
  visibleOrganizations,
} from "./personal-organization";

type Org = { id: string; slug: string; status?: string; metadata?: unknown };

const userId = "user-1";
const personal: Org = {
  id: "org-personal",
  slug: "personal-space",
  metadata: { isPersonal: true },
};
const legacyPersonal: Org = { id: "org-legacy", slug: userId, metadata: {} };
const harbor: Org = { id: "org-harbor", slug: "harbor", status: "active", metadata: {} };
const delta: Org = { id: "org-delta", slug: "delta", status: "active", metadata: null };
const pending: Org = {
  id: "org-pending",
  slug: "pending-request",
  status: "pending",
  metadata: {},
};

const resolve = (organizations: Org[] | undefined, activeOrganizationId: string | null) =>
  resolveCommunityMembership({ organizations, activeOrganizationId, userId });

describe("isPersonalOrganization", () => {
  it("detects a personal organization by its flag or by the user's ID as its slug", () => {
    expect(isPersonalOrganization(personal, userId)).toBe(true);
    expect(isPersonalOrganization(legacyPersonal, userId)).toBe(true);
    expect(isPersonalOrganization(harbor, userId)).toBe(false);
    expect(isPersonalOrganization(personal, null)).toBe(false);
  });

  it("hides personal organizations from the visible list", () => {
    expect(visibleOrganizations([personal, harbor, legacyPersonal], userId)).toEqual([harbor]);
  });
});

describe("resolveCommunityMembership", () => {
  it("waits while organizations or the user are unknown", () => {
    expect(resolve(undefined, null)).toEqual({ status: "unknown" });
    expect(
      resolveCommunityMembership({
        organizations: [harbor],
        activeOrganizationId: null,
        userId: null,
      }),
    ).toEqual({ status: "unknown" });
  });

  it("has no community with zero organizations or only a personal one", () => {
    expect(resolve([], null)).toEqual({ status: "none" });
    expect(resolve([personal], personal.id)).toEqual({ status: "none" });
  });

  it("keeps a valid active community", () => {
    expect(resolve([personal, harbor, delta], delta.id)).toEqual({
      status: "active",
      organization: delta,
    });
  });

  it("opens the only community when nothing valid is active", () => {
    expect(resolve([personal, harbor], null)).toEqual({
      status: "open",
      organization: harbor,
    });
    expect(resolve([harbor], "org-gone")).toEqual({ status: "open", organization: harbor });
  });

  it("asks to choose instead of switching away from an active personal organization", () => {
    expect(resolve([personal, harbor], personal.id)).toEqual({
      status: "choose",
      count: 1,
    });
  });

  it("asks to choose when several communities are visible and none is active", () => {
    expect(resolve([personal, harbor, delta], null)).toEqual({
      status: "choose",
      count: 2,
    });
  });

  it("never treats a pending or rejected request as a community", () => {
    const rejected: Org = {
      id: "org-rejected",
      slug: "rejected",
      status: "rejected",
      metadata: {},
    };
    expect(resolve([personal, pending], pending.id)).toEqual({ status: "none" });
    expect(resolve([personal, rejected], personal.id)).toEqual({ status: "none" });
    expect(resolve([pending, rejected], null)).toEqual({ status: "none" });
    expect(resolve([personal, pending, harbor], null)).toEqual({
      status: "open",
      organization: harbor,
    });
    expect(resolve([personal, pending, harbor], personal.id)).toEqual({
      status: "choose",
      count: 1,
    });
  });

  it("gives the organization to load a community from", () => {
    expect(communityOrganizationId({ status: "active", organization: harbor })).toBe(harbor.id);
    expect(communityOrganizationId({ status: "open", organization: harbor })).toBe(harbor.id);
    expect(communityOrganizationId({ status: "choose", count: 2 })).toBeNull();
    expect(communityOrganizationId({ status: "none" })).toBeNull();
  });

  it("waits instead of deciding while a list without the active organization refreshes", () => {
    expect(
      resolveCommunityMembership({
        organizations: [personal, harbor],
        activeOrganizationId: "org-just-joined",
        userId,
        refreshing: true,
      }),
    ).toEqual({ status: "unknown" });
    expect(
      resolveCommunityMembership({
        organizations: [personal, harbor],
        activeOrganizationId: harbor.id,
        userId,
        refreshing: true,
      }),
    ).toEqual({ status: "active", organization: harbor });
  });

  it("keeps a platform admin's active organization even when they aren't a member", () => {
    expect(
      resolveCommunityMembership({
        organizations: [personal, harbor],
        activeOrganizationId: "org-admin-viewing",
        userId,
        isAdmin: true,
      }),
    ).toEqual({ status: "unknown" });
  });
});
