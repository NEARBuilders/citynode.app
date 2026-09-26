import { describe, expect, it } from "vitest";
import { filterThings } from "./-thing-list";

const things = [
  { thingId: "regression-plugin-test", type: "note" },
  { thingId: "demo-1", type: "Event" },
];

describe("filterThings", () => {
  it("returns every thing for a blank query", () => {
    expect(filterThings(things, "  ")).toEqual(things);
  });

  it("matches id or type case-insensitively", () => {
    expect(filterThings(things, "PLUGIN")).toEqual([things[0]]);
    expect(filterThings(things, "event")).toEqual([things[1]]);
    expect(filterThings(things, "nothing")).toEqual([]);
  });
});
