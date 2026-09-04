import { describe, expect, it } from "vitest";
import { deriveSlug, generateSlug } from "./slug";

describe("generateSlug", () => {
  it("keeps a slug synchronized with the complete source value", () => {
    expect(generateSlug("Chicago")).toBe("chicago");
    expect(generateSlug("Chicago Heights")).toBe("chicago-heights");
    expect(generateSlug("  São Paulo  ")).toBe("s-o-paulo");
  });

  it("preserves a manually edited slug", () => {
    expect(deriveSlug("Chicago Heights", "chicago", false)).toBe("chicago-heights");
    expect(deriveSlug("Chicago Heights", "chi-town", true)).toBe("chi-town");
  });
});
