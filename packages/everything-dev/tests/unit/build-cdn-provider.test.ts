import { describe, expect, it } from "vitest";
import { resolveCdnProvider } from "../../src/build";
import { BosConfigSchema } from "../../src/types";

function makeConfig(overrides: Record<string, unknown> = {}) {
  return BosConfigSchema.parse({
    account: "v1.citynode.near",
    domain: "citynode.app",
    app: {
      host: { development: "local:host", production: "https://host.example.com" },
      ui: { development: "local:ui", production: "https://ui.example.com" },
      api: { development: "local:api", production: "https://api.example.com" },
    },
    ...overrides,
  });
}

describe("resolveCdnProvider", () => {
  it("defaults to zephyr for a null config", () => {
    expect(resolveCdnProvider(null)).toBe("zephyr");
  });

  it("defaults to zephyr when no deploy section exists", () => {
    expect(resolveCdnProvider(makeConfig())).toBe("zephyr");
  });

  it("defaults to zephyr when deploy exists without cdn", () => {
    expect(resolveCdnProvider(makeConfig({ deploy: { provider: "railway" } }))).toBe("zephyr");
  });

  it("returns cloudflare when selected", () => {
    expect(resolveCdnProvider(makeConfig({ deploy: { cdn: "cloudflare" } }))).toBe("cloudflare");
  });

  it("returns zephyr when explicitly selected", () => {
    expect(resolveCdnProvider(makeConfig({ deploy: { cdn: "zephyr" } }))).toBe("zephyr");
  });
});
