import { describe, expect, it } from "vitest";
import { emptyDiscoveryProfile, withProfileLocation } from "./profile-fields";

describe("withProfileLocation", () => {
  it("clears stale coordinates when the location text no longer matches the geocode", () => {
    const profile = {
      ...emptyDiscoveryProfile("node-1"),
      location: "Lisbon",
      latitude: 38.72,
      longitude: -9.14,
      geocodedLocation: "Lisbon",
    };
    expect(withProfileLocation(profile, "Porto")).toMatchObject({
      location: "Porto",
      latitude: null,
      longitude: null,
      geocodedLocation: null,
    });
  });
});
