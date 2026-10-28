import { describe, expect, it } from "vitest";
import { selectCommunityNode, sortCommunityNodes } from "./community-node";

const lagos = { id: "n-3", name: "Lagos" };
const berlinB = { id: "n-2", name: "Berlin" };
const berlinA = { id: "n-1", name: "Berlin" };

describe("selectCommunityNode", () => {
  it("returns null for an empty list", () => {
    expect(selectCommunityNode([])).toBeNull();
    expect(selectCommunityNode([], "n-1")).toBeNull();
  });

  it("picks the first node by name from an unsorted list", () => {
    expect(selectCommunityNode([lagos, berlinB])).toBe(berlinB);
  });

  it("breaks equal names by ID so the default is deterministic", () => {
    expect(selectCommunityNode([lagos, berlinB, berlinA])).toBe(berlinA);
    expect(selectCommunityNode([berlinA, berlinB, lagos])).toBe(berlinA);
  });

  it("honors a valid requested ID", () => {
    expect(selectCommunityNode([berlinA, lagos], "n-3")).toBe(lagos);
  });

  it("falls back to the default for an unknown requested ID", () => {
    expect(selectCommunityNode([lagos, berlinA], "missing")).toBe(berlinA);
    expect(selectCommunityNode([lagos, berlinA], "")).toBe(berlinA);
  });
});

describe("sortCommunityNodes", () => {
  it("sorts by name then ID without mutating the input", () => {
    const input = [lagos, berlinB, berlinA];
    expect(sortCommunityNodes(input)).toEqual([berlinA, berlinB, lagos]);
    expect(input).toEqual([lagos, berlinB, berlinA]);
  });
});
