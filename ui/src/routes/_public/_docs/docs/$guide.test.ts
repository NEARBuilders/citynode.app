import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { guidePageHead, loadGuide } from "./$guide";

const fixtureFiles = {
  "./run-a-community.txt": "# Run a community\n\nHow a DAO runs a city node.",
};

describe("docs guide route", () => {
  it("throws not-found for an unknown guide", () => {
    try {
      loadGuide("missing-guide", "en", fixtureFiles);
      expect.unreachable();
    } catch (error) {
      expect(isNotFound(error)).toBe(true);
    }
  });

  it("sets the page title and link preview from the guide", () => {
    const guide = loadGuide("run-a-community", "en", fixtureFiles);
    const meta = guidePageHead(guide, { hostUrl: "https://citynode.app" }).meta;
    expect(meta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining("Run a community") }),
        expect.objectContaining({
          name: "description",
          content: "How a DAO runs a city node.",
        }),
      ]),
    );
    expect(meta.some((entry) => "property" in entry && entry.property === "og:title")).toBe(true);
  });
});
