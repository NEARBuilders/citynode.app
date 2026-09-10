import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantUiOverride } from "./dao-policy";
import {
  buildDraftFromResolvedConfig,
  computeSubresourceIntegrity,
  diffDraft,
  draftUiOverride,
  emptyTenantConfigDraft,
  tenantConfigDraftSchema,
  verifyUiIntegrity,
} from "./tenant-config-draft";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tenantConfigDraftSchema", () => {
  it("accepts a metadata-only draft", () => {
    const result = tenantConfigDraftSchema.safeParse({
      ...emptyTenantConfigDraft,
      title: "Chicago",
      description: "The Chicago node",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a UI bundle URL without an integrity hash", () => {
    const result = tenantConfigDraftSchema.safeParse({
      ...emptyTenantConfigDraft,
      title: "Chicago",
      description: "Chicago",
      uiProduction: "https://cdn.example.com/ui.js",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed integrity hash", () => {
    const result = tenantConfigDraftSchema.safeParse({
      ...emptyTenantConfigDraft,
      title: "Chicago",
      description: "Chicago",
      uiProduction: "https://cdn.example.com/ui.js",
      uiIntegrity: "md5-abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an SSR bundle URL without an integrity hash", () => {
    const result = tenantConfigDraftSchema.safeParse({
      ...emptyTenantConfigDraft,
      title: "Chicago",
      description: "Chicago",
      ssrUrl: "https://cdn.example.com/ssr.js",
    });
    expect(result.success).toBe(false);
  });
});

describe("buildDraftFromResolvedConfig", () => {
  it("prefills from a published config", () => {
    const draft = buildDraftFromResolvedConfig(
      {
        title: "Chicago",
        description: "The Chicago node",
        repository: "https://github.com/example/chicago",
        app: {
          ui: {
            production: "https://cdn.example.com/ui.js",
            integrity: "sha384-abc",
            ssr: "https://cdn.example.com/ssr.js",
            ssrIntegrity: "sha384-def",
          },
        },
      },
      { title: "fallback" },
    );
    expect(draft).toEqual({
      title: "Chicago",
      description: "The Chicago node",
      repository: "https://github.com/example/chicago",
      uiProduction: "https://cdn.example.com/ui.js",
      uiIntegrity: "sha384-abc",
      ssrUrl: "https://cdn.example.com/ssr.js",
      ssrIntegrity: "sha384-def",
    });
  });

  it("falls back to the tenant name when nothing is published", () => {
    const draft = buildDraftFromResolvedConfig(null, { title: "Chicago" });
    expect(draft.title).toBe("Chicago");
    expect(draft.description).toBe("Chicago");
    expect(draft.uiProduction).toBe("");
  });
});

describe("diffDraft", () => {
  it("reports only the fields that change", () => {
    const draft = {
      ...emptyTenantConfigDraft,
      title: "Chicago",
      description: "The Chicago node",
      uiProduction: "https://cdn.example.com/ui.js",
      uiIntegrity: "sha384-abc",
    };
    const diff = diffDraft(draft, {
      title: "Chicago",
      description: "Chicago",
      app: { ui: { production: "https://old.example.com/ui.js" } },
    });
    expect(diff.map((entry) => entry.field)).toEqual(["description", "ui bundle", "ui integrity"]);
    expect(diff.find((entry) => entry.field === "ui bundle")?.from).toBe(
      "https://old.example.com/ui.js",
    );
    expect(diff.find((entry) => entry.field === "ui bundle")?.to).toBe(
      "https://cdn.example.com/ui.js",
    );
  });

  it("reports nothing when the draft matches the published config", () => {
    const draft = buildDraftFromResolvedConfig(
      { title: "Chicago", description: "Chicago" },
      { title: "Chicago" },
    );
    expect(diffDraft(draft, { title: "Chicago", description: "Chicago" })).toEqual([]);
  });
});

describe("draftUiOverride", () => {
  it("returns undefined when no UI bundle is set", () => {
    expect(draftUiOverride(emptyTenantConfigDraft)).toBeUndefined();
  });

  it("builds the app.ui block, including ssr only when both parts are present", () => {
    const base = {
      ...emptyTenantConfigDraft,
      title: "Chicago",
      description: "Chicago",
      uiProduction: "https://cdn.example.com/ui.js",
      uiIntegrity: "sha384-abc",
    };
    expect(draftUiOverride(base)).toEqual({
      ui: { production: "https://cdn.example.com/ui.js", integrity: "sha384-abc" },
    });
    expect(draftUiOverride({ ...base, ssrUrl: "https://cdn.example.com/ssr.js" })).toEqual({
      ui: { production: "https://cdn.example.com/ui.js", integrity: "sha384-abc" },
    });
    expect(
      draftUiOverride({
        ...base,
        ssrUrl: "https://cdn.example.com/ssr.js",
        ssrIntegrity: "sha384-def",
      }),
    ).toEqual({
      ui: {
        production: "https://cdn.example.com/ui.js",
        integrity: "sha384-abc",
        ssr: "https://cdn.example.com/ssr.js",
        ssrIntegrity: "sha384-def",
      },
    } satisfies { ui: TenantUiOverride });
  });
});

describe("integrity preflight", () => {
  const bundleUrl = "https://cdn.example.com/ui.js";
  const stubBundle = (content: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(content)),
    );

  it("computes a sha384 integrity hash from a fetched bundle", async () => {
    stubBundle("console.log('hi')");
    await expect(computeSubresourceIntegrity(bundleUrl)).resolves.toMatch(
      /^sha384-[A-Za-z0-9+/=]+$/,
    );
  });

  it("matches when the expected hash equals the computed one", async () => {
    stubBundle("console.log('hi')");
    const expected = await computeSubresourceIntegrity(bundleUrl);
    expect(await verifyUiIntegrity(bundleUrl, expected)).toEqual({ status: "match" });
  });

  it("mismatches when the bundle hashes differently", async () => {
    stubBundle("console.log('hi')");
    const expected = await computeSubresourceIntegrity(bundleUrl);
    stubBundle("console.log('tampered')");
    const check = await verifyUiIntegrity(bundleUrl, expected);
    expect(check.status).toBe("mismatch");
  });

  it("reports unverified when the bundle cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network blocked")));
    const check = await verifyUiIntegrity(bundleUrl, "sha384-abc");
    expect(check.status).toBe("unverified");
    if (check.status === "unverified") expect(check.reason).toContain("network blocked");
  });
});
