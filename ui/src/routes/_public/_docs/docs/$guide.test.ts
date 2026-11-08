import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { loadGuide } from "./$guide";

const fixtureFiles = {
  "./run-a-community.md": "# Run a community\n\nHow a DAO runs a city node.",
};

describe("docs guide route", () => {
  it("loads a known guide", () => {
    expect(loadGuide("run-a-community", "en", fixtureFiles).title).toBe("Run a community");
  });

  it("throws not-found for an unknown guide", () => {
    try {
      loadGuide("missing-guide", "en", fixtureFiles);
      expect.unreachable();
    } catch (error) {
      expect(isNotFound(error)).toBe(true);
    }
  });
});
