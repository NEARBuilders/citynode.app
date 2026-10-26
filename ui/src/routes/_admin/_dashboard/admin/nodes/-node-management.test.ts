import { describe, expect, it } from "vitest";
import {
  filterNodeRows,
  parseNodeDetailTab,
  parseNodeEditSearch,
  parseNodeMetadata,
} from "./-node-management";

describe("node metadata editing", () => {
  it("preserves arbitrary JSON data while saving the description field", () => {
    expect(
      parseNodeMetadata(
        '{"population":2700000,"tags":["city"],"location":{"lat":41.8}}',
        " Chicago ",
      ),
    ).toEqual({
      population: 2700000,
      tags: ["city"],
      location: { lat: 41.8 },
      description: "Chicago",
    });
  });

  it.each([
    "null",
    "[]",
    "42",
    '"text"',
    "{broken",
  ])("rejects invalid or non-object metadata: %s", (raw) => {
    expect(() => parseNodeMetadata(raw, "")).toThrow();
  });

  it("uses the description field to update or remove metadata.description", () => {
    expect(parseNodeMetadata('{"description":"old","population":1}', "new")).toEqual({
      description: "new",
      population: 1,
    });
    expect(parseNodeMetadata('{"description":"old","population":1}', " ")).toEqual({
      population: 1,
    });
  });
});

describe("node list search", () => {
  const rows = [
    { node: { name: "Chicago", slug: "chicago" }, parent: { name: "United States" } },
    { node: { name: "Lahore", slug: "lhr" }, parent: { name: "Pakistan" } },
    { node: { name: "Pakistan", slug: "pakistan" }, parent: undefined },
  ];

  it("returns every row for an empty query", () => {
    expect(filterNodeRows(rows, "  ")).toHaveLength(3);
  });

  it("matches name, slug and parent without case sensitivity", () => {
    expect(filterNodeRows(rows, "CHI").map((row) => row.node.name)).toEqual(["Chicago"]);
    expect(filterNodeRows(rows, "lhr").map((row) => row.node.name)).toEqual(["Lahore"]);
    expect(filterNodeRows(rows, "pakistan").map((row) => row.node.name)).toEqual([
      "Lahore",
      "Pakistan",
    ]);
  });
});

describe("node detail tabs", () => {
  it.each(["overview", "validators", "management", "domains"])("accepts %s", (tab) => {
    expect(parseNodeDetailTab(tab)).toBe(tab);
  });

  it("opens Node management for old ?tab=sequence links", () => {
    expect(parseNodeDetailTab("sequence")).toBe("management");
  });

  it.each([undefined, "", "bindings", "constructor", "profile", 3])("ignores %s", (tab) => {
    expect(parseNodeDetailTab(tab)).toBeUndefined();
  });
});

describe("community editor search", () => {
  it.each([
    { edit: true },
    { edit: "true" },
    { tab: "profile" },
  ])("opens the editor for %o", (search) => {
    expect(parseNodeEditSearch(search)).toBe(true);
  });

  it.each([
    {},
    { edit: false },
    { edit: "1" },
    { tab: "domains" },
  ])("keeps it closed for %o", (search) => {
    expect(parseNodeEditSearch(search)).toBeUndefined();
  });
});
