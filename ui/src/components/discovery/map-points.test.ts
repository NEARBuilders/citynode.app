import { describe, expect, it } from "vitest";
import { clampToWorld } from "./map-points";

describe("clampToWorld", () => {
  it("keeps an outline inside the world and trims it to the polar limits", () => {
    expect(
      clampToWorld([
        [-90, 10],
        [20, 30],
      ]),
    ).toEqual([
      [-85, 10],
      [20, 30],
    ]);
  });

  it("drops an outline that crosses the antimeridian so the map fits the pin instead", () => {
    expect(
      clampToWorld([
        [18, 172],
        [72, 294],
      ]),
    ).toBeNull();
    expect(
      clampToWorld([
        [-20, 177],
        [-15, 182],
      ]),
    ).toBeNull();
  });
});
