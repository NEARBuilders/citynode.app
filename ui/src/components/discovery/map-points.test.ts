import { describe, expect, it } from "vitest";
import { clampToWorld } from "./map-points";

describe("clampToWorld", () => {
  it("keeps an outline that crosses the antimeridian inside the single world copy", () => {
    expect(
      clampToWorld([
        [-20, 177],
        [-15, 182],
      ]),
    ).toEqual([
      [-20, 177],
      [-15, 180],
    ]);
  });

  it("drops an outline that lies wholly past the edge", () => {
    expect(
      clampToWorld([
        [10, 185],
        [12, 190],
      ]),
    ).toBeNull();
  });
});
