import { describe, expect, it } from "vitest";
import { communityMapStatus } from "./community-map-status";

const pinned = { latitude: 38.72, longitude: -9.14 };
const unpinned = { latitude: null, longitude: null };

describe("communityMapStatus", () => {
  it("reports an inactive tenant before anything the public listing says", () => {
    for (const tenantStatus of ["suspended", "pending", "pending_deletion"] as const) {
      for (const listing of [pinned, unpinned, null, undefined]) {
        expect(communityMapStatus({ tenantStatus, listing })).toEqual({
          state: "inactive",
          tenantStatus,
        });
      }
    }
  });

  it("separates hidden, listed without a pin, and on the map for an active tenant", () => {
    expect(communityMapStatus({ tenantStatus: "active", listing: null })).toEqual({
      state: "hidden",
    });
    expect(communityMapStatus({ tenantStatus: "active", listing: unpinned })).toEqual({
      state: "noPin",
    });
    expect(communityMapStatus({ tenantStatus: "active", listing: pinned })).toEqual({
      state: "onMap",
    });
  });

  it("shows nothing until both the tenant and the listing have loaded", () => {
    expect(communityMapStatus({ tenantStatus: undefined, listing: null })).toBeNull();
    expect(communityMapStatus({ tenantStatus: "active", listing: undefined })).toBeNull();
  });
});
