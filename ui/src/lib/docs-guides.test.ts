import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collidingGuideSlugs, listGuides, parseGuideFilename, resolveGuide } from "./docs-guides";

const shippedGuidesDir = join(dirname(fileURLToPath(import.meta.url)), "../content/docs");

const fixtureFiles = {
  "./run-a-community.md": "# Run a community\n\nHow a DAO runs a city node.",
  "./run-a-community.es.md": "# Dirigir una comunidad\n\nCómo un DAO dirige un city node.",
  "./claim-rewards.md": "# Claim rewards\n\nWithdraw staking rewards after a vote.",
};

describe("parseGuideFilename", () => {
  it("reads the slug from the filename and optional locale suffix", () => {
    expect(parseGuideFilename("run-a-community.md")).toEqual({
      slug: "run-a-community",
      locale: "en",
    });
    expect(parseGuideFilename("../content/docs/run-a-community.es.md")).toEqual({
      slug: "run-a-community",
      locale: "es",
    });
    expect(parseGuideFilename("run-a-community.zh.md")).toEqual({
      slug: "run-a-community",
      locale: "zh",
    });
  });

  it("ignores files that are not lowercase slugs", () => {
    expect(parseGuideFilename("Run-a-community.md")).toBeNull();
    expect(parseGuideFilename("run_a_community.md")).toBeNull();
    expect(parseGuideFilename("run-a-community.de.md")).toBeNull();
  });
});

describe("listGuides", () => {
  it("returns no guides when the catalog is empty", () => {
    expect(listGuides("en", {})).toEqual([]);
    expect(listGuides("es", {})).toEqual([]);
  });

  it("lists each English guide once, with the title from the first heading", () => {
    expect(listGuides("en", fixtureFiles)).toEqual([
      { slug: "claim-rewards", title: "Claim rewards" },
      { slug: "run-a-community", title: "Run a community" },
    ]);
  });

  it("uses the locale title when a translation exists", () => {
    expect(listGuides("es", fixtureFiles)).toEqual([
      { slug: "claim-rewards", title: "Claim rewards" },
      { slug: "run-a-community", title: "Dirigir una comunidad" },
    ]);
  });
});

describe("resolveGuide", () => {
  it("falls back to English when the locale file is missing", () => {
    const guide = resolveGuide("run-a-community", "fr", fixtureFiles);
    expect(guide).toMatchObject({
      slug: "run-a-community",
      title: "Run a community",
      description: "How a DAO runs a city node.",
      body: "How a DAO runs a city node.",
    });
  });

  it("returns the translated document when it exists", () => {
    expect(resolveGuide("run-a-community", "es", fixtureFiles)?.title).toBe(
      "Dirigir una comunidad",
    );
  });

  it("returns null for an unknown guide", () => {
    expect(resolveGuide("missing-guide", "en", fixtureFiles)).toBeNull();
    expect(resolveGuide("missing-guide", "es", {})).toBeNull();
  });

  it("does not resolve a reserved docs route as a guide", () => {
    expect(resolveGuide("build", "en", { "./build.md": "# Builders\n\nNope." })).toBeNull();
  });
});

describe("shipped guide files", () => {
  it("does not ship placeholder guides", () => {
    const shipped = readdirSync(shippedGuidesDir).filter((name) => name.endsWith(".md"));
    expect(shipped).toEqual([]);
  });

  it("fails when a guide filename collides with /docs/build", () => {
    expect(collidingGuideSlugs(["build.md", "build.es.md"])).toEqual(["build"]);
  });
});
