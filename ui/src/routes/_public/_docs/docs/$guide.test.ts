import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { loadGuide } from "./$guide";

describe("docs guide route", () => {
  it("throws not-found for an unknown guide", () => {
    try {
      loadGuide("missing-guide", "en", {
        "./run-a-community.md": "# Run a community\n\nHow a DAO runs a city node.",
      });
      expect.unreachable();
    } catch (error) {
      expect(isNotFound(error)).toBe(true);
    }
  });
});
