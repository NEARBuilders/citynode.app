import { describe, expect, it } from "vitest";
import { ComposeCache } from "../../src/ui/compose/cache";
import { computeComposeDigest } from "../../src/ui/compose/digest";

describe("computeComposeDigest", () => {
  const base = [
    {
      id: "core",
      ui: { url: "https://cdn/ui", integrity: "sha384-abc" },
      ssrUrl: "https://cdn/ui-ssr",
      ssrIntegrity: "sha384-ssr",
    },
    {
      id: "auth",
      ui: { url: "https://cdn/auth-ui", integrity: "sha384-auth" },
      ssrUrl: "https://cdn/auth-ui-ssr",
      ssrIntegrity: "sha384-auth-ssr",
    },
  ];

  it("is stable for identical fingerprints in any order", () => {
    expect(computeComposeDigest(base, "1")).toBe(computeComposeDigest([...base].reverse(), "1"));
  });

  it("changes when any remote url or integrity changes", () => {
    const bumped = [{ ...base[1], ui: { ...base[1].ui, integrity: "sha384-new" } }, base[0]];
    expect(computeComposeDigest(bumped, "1")).not.toBe(computeComposeDigest(base, "1"));
  });

  it("changes with the registry version", () => {
    expect(computeComposeDigest(base, "2")).not.toBe(computeComposeDigest(base, "1"));
  });
});

describe("ComposeCache", () => {
  it("returns entries until they expire", () => {
    const cache = new ComposeCache<string>(1000);
    cache.set("a", "one", 0);
    expect(cache.get("a", 999)).toBe("one");
    expect(cache.get("a", 1000)).toBeUndefined();
  });

  it("evicts oldest entries beyond the limit", () => {
    const cache = new ComposeCache<string>(1000, 2);
    cache.set("a", "1", 0);
    cache.set("b", "2", 0);
    cache.set("c", "3", 0);
    expect(cache.size).toBe(2);
    expect(cache.get("a", 10)).toBeUndefined();
    expect(cache.get("c", 10)).toBe("3");
  });

  it("clear and delete work", () => {
    const cache = new ComposeCache<string>(1000);
    cache.set("a", "1", 0);
    cache.delete("a");
    expect(cache.get("a", 1)).toBeUndefined();
    cache.set("b", "2", 0);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
