import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findDevOverlayPath, resetDevOverlayPathCache } from "../../src/config";

describe("findDevOverlayPath", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "bos-dev-overlay-"));
    resetDevOverlayPathCache();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    resetDevOverlayPathCache();
  });

  it("walks up from cwd and finds bos.dev.ts beside the discovered entry config", () => {
    const nested = join(root, "nested", "deep");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "bos.config.json"), "{}");
    writeFileSync(join(root, "bos.dev.ts"), "export default {}");

    expect(findDevOverlayPath(nested)).toBe(join(root, "bos.dev.ts"));
    expect(findDevOverlayPath(root)).toBe(join(root, "bos.dev.ts"));
  });

  it("finds the overlay beside a bos.app.ts entry config too", () => {
    writeFileSync(join(root, "bos.app.ts"), "export const App = {}");
    writeFileSync(join(root, "bos.dev.ts"), "export default {}");

    expect(findDevOverlayPath(root)).toBe(join(root, "bos.dev.ts"));
  });

  it("ignores an overlay in a directory without an entry config", () => {
    const child = join(root, "child");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(root, "bos.dev.ts"), "export default {}");
    writeFileSync(join(child, "bos.config.json"), "{}");

    expect(findDevOverlayPath(child)).toBeNull();
  });

  it("returns null when the entry config has no overlay beside it", () => {
    writeFileSync(join(root, "bos.config.json"), "{}");

    expect(findDevOverlayPath(root)).toBeNull();
  });

  it("memoizes the lookup until the cache is reset", () => {
    writeFileSync(join(root, "bos.config.json"), "{}");
    writeFileSync(join(root, "bos.dev.ts"), "export default {}");
    expect(findDevOverlayPath(root)).toBe(join(root, "bos.dev.ts"));

    rmSync(join(root, "bos.dev.ts"));
    expect(findDevOverlayPath(root)).toBe(join(root, "bos.dev.ts"));

    resetDevOverlayPathCache();
    expect(findDevOverlayPath(root)).toBeNull();
  });
});
