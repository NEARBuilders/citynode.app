import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collidingGuideSlugs, listGuides, parseGuideFilename, resolveGuide } from "./docs-guides";

const shippedGuidesDir = join(dirname(fileURLToPath(import.meta.url)), "../content/docs");

const fixtureFiles = {
  "./run-a-community.txt": "# Run a community\n\nHow a DAO runs a city node.",
  "./run-a-community.es.txt": "# Dirigir una comunidad\n\nCómo un DAO dirige un city node.",
  "./claim-rewards.txt": "# Claim rewards\n\nWithdraw staking rewards after a vote.",
};

describe("parseGuideFilename", () => {
  it("reads the slug from the filename and optional locale suffix", () => {
    expect(parseGuideFilename("run-a-community.txt")).toEqual({
      slug: "run-a-community",
      locale: "en",
    });
    expect(parseGuideFilename("../content/docs/run-a-community.es.txt")).toEqual({
      slug: "run-a-community",
      locale: "es",
    });
    expect(parseGuideFilename("run-a-community.zh.txt")).toEqual({
      slug: "run-a-community",
      locale: "zh",
    });
  });

  it("ignores files that are not lowercase slugs", () => {
    expect(parseGuideFilename("Run-a-community.txt")).toBeNull();
    expect(parseGuideFilename("run_a_community.txt")).toBeNull();
    expect(parseGuideFilename("run-a-community.de.txt")).toBeNull();
    expect(parseGuideFilename("run-a-community.md")).toBeNull();
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
    expect(resolveGuide("build", "en", { "./build.txt": "# Builders\n\nNope." })).toBeNull();
  });

  it("takes the title from the first heading at any level", () => {
    expect(
      resolveGuide("run-a-community", "en", {
        "./run-a-community.txt": "## Run a community\n\nHow a DAO runs a city node.",
      })?.title,
    ).toBe("Run a community");
  });
});

describe("shipped guide files", () => {
  const shipped = readdirSync(shippedGuidesDir);

  it("fails when a guide filename collides with /docs/build", () => {
    expect(collidingGuideSlugs(["build.txt", "build.es.txt"])).toEqual(["build"]);
    expect(collidingGuideSlugs(shipped)).toEqual([]);
  });

  it("fails when a leftover markdown file would be skipped by the bundler", () => {
    expect(shipped.filter((name) => name.endsWith(".md"))).toEqual([]);
  });

  it("lists every shipped English guide from the bundled catalog", () => {
    const expected = [
      ...new Set(
        shipped.flatMap((name) => {
          const parsed = parseGuideFilename(name);
          return parsed?.locale === "en" ? [parsed.slug] : [];
        }),
      ),
    ].sort();
    expect(listGuides("en").map((guide) => guide.slug)).toEqual(expected);
  });
});
