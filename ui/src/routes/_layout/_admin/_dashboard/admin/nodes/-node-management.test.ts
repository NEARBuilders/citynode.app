import { describe, expect, it } from "vitest";
import { parseNodeMetadata } from "./-node-management";

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
