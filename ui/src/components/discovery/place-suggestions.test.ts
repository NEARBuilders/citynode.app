import { describe, expect, it } from "vitest";
import { suggestPlaces } from "./place-suggestions";

const place = (name: string, slug: string, activated = false) => ({
  id: slug,
  slug,
  name,
  activated,
});

const catalog = [
  place("Malaysia", "malaysia", true),
  place("Kuala Lumpur", "kuala-lumpur"),
  place("Kuala Terengganu", "kuala-terengganu"),
  place("Selangor", "selangor"),
  place("Kualalumpur Heights", "kualalumpur-heights"),
];

describe("suggestPlaces", () => {
  it("finds a catalog place for a search that matches no community", () => {
    expect(suggestPlaces(catalog, "  Kuala Lumpur ").map((p) => p.slug)).toEqual(["kuala-lumpur"]);
  });

  it("puts exact and prefix matches before other matches", () => {
    expect(suggestPlaces(catalog, "kuala").map((p) => p.slug)).toEqual([
      "kuala-lumpur",
      "kuala-terengganu",
      "kualalumpur-heights",
    ]);
    expect(suggestPlaces(catalog, "lumpur").map((p) => p.slug)).toEqual([
      "kuala-lumpur",
      "kualalumpur-heights",
    ]);
  });

  it("matches slugs when the query uses spaces", () => {
    expect(suggestPlaces([place("KL", "kuala-lumpur")], "kuala lumpur")).toHaveLength(1);
  });

  it("returns nothing for an empty query and caps the list", () => {
    expect(suggestPlaces(catalog, "   ")).toEqual([]);
    expect(suggestPlaces(catalog, "a", 2)).toHaveLength(2);
  });
});
