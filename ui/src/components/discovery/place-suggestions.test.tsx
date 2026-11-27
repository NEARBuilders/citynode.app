// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { matchesPlace, PlaceSuggestions, suggestPlaces } from "./place-suggestions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params: { slug: string };
    children?: ReactNode;
  }) => (
    <a href={to.replace("$slug", params.slug)} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const place = (name: string, slug: string, activated = false, label: string | null = "city") => ({
  id: slug,
  slug,
  name,
  label,
  activated,
});

const catalog = [
  place("Malaysia", "malaysia", true, "country"),
  place("Kuala Lumpur", "kuala-lumpur"),
  place("Kuala Terengganu", "kuala-terengganu"),
  place("Selangor", "selangor", false, "subdivision"),
  place("Malmö", "malmo"),
];

describe("suggestPlaces", () => {
  it("finds a catalog place for a search that matches no community", () => {
    expect(suggestPlaces(catalog, "  Kuala Lumpur ").map((p) => p.slug)).toEqual(["kuala-lumpur"]);
  });

  it("puts exact and prefix matches before other matches", () => {
    const list = [place("Port Kuala", "port-kuala"), ...catalog];
    expect(suggestPlaces(list, "kuala").map((p) => p.slug)).toEqual([
      "kuala-lumpur",
      "kuala-terengganu",
      "port-kuala",
    ]);
  });

  it("ignores accents and matches slugs typed with spaces", () => {
    expect(suggestPlaces(catalog, "malmo").map((p) => p.slug)).toEqual(["malmo"]);
    expect(suggestPlaces([place("KL", "kuala-lumpur")], "kuala lumpur")).toHaveLength(1);
  });

  it("returns nothing for an empty query and caps the list", () => {
    expect(suggestPlaces(catalog, "   ")).toEqual([]);
    expect(suggestPlaces(catalog, "a", 2)).toHaveLength(2);
  });

  it("matches every place for an empty query, as the map expects", () => {
    expect(catalog.every((p) => matchesPlace(p, ""))).toBe(true);
    expect(matchesPlace(catalog[1], "lumpur")).toBe(true);
    expect(matchesPlace(catalog[1], "selangor")).toBe(false);
  });
});

describe("PlaceSuggestions", () => {
  it("offers to start a community in a place that has none", () => {
    render(<PlaceSuggestions places={[place("Kuala Lumpur", "kuala-lumpur")]} />);
    expect(screen.getByText(/No community in Kuala Lumpur \(City\) yet\./)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Start one" });
    expect(link.getAttribute("href")).toBe("/places/kuala-lumpur");
  });

  it("opens the place page when the place already has a community", () => {
    render(<PlaceSuggestions places={[place("Malaysia", "malaysia", true, "country")]} />);
    expect(screen.getByText(/Malaysia \(Country\) has a community\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe(
      "/places/malaysia",
    );
  });
});
