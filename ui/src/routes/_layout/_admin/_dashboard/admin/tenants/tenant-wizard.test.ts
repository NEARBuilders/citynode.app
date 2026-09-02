import { describe, expect, it } from "vitest";
import {
  classifyTenantKey,
  type NearNetworkId,
  resolveOrgSlug,
  resolvePrimaryHostname,
} from "./tenant-wizard";

describe("classifyTenantKey", () => {
  it("classifies tenant UUIDs", () => {
    expect(classifyTenantKey("6e8c1159-97ec-43bd-ae4a-56ecc492edfa")).toBe("uuid");
    expect(classifyTenantKey("6E8C1159-97EC-43BD-AE4A-56ECC492EDFA")).toBe("uuid");
  });

  it("classifies NEAR account ids by their dot segments", () => {
    expect(classifyTenantKey("testing123.sputnik-dao.near")).toBe("accountId");
    expect(classifyTenantKey("chicago.v1.citynode.near")).toBe("accountId");
  });

  it("classifies bare directory slugs", () => {
    expect(classifyTenantKey("test")).toBe("slug");
    expect(classifyTenantKey("chicago")).toBe("slug");
  });
});

describe("resolvePrimaryHostname", () => {
  it("prefers the primary binding's hostname", () => {
    expect(
      resolvePrimaryHostname([
        { hostname: "fallback.citynode.app", isPrimary: false },
        { hostname: "test.citynode.app", isPrimary: true },
      ]),
    ).toBe("test.citynode.app");
  });

  it("falls back to the first binding with a hostname", () => {
    expect(
      resolvePrimaryHostname([
        { hostname: "", isPrimary: true },
        { hostname: "only.citynode.app", isPrimary: false },
      ]),
    ).toBe("only.citynode.app");
  });

  it("returns null for empty, missing, or hostname-less inputs", () => {
    expect(resolvePrimaryHostname(null)).toBeNull();
    expect(resolvePrimaryHostname(undefined)).toBeNull();
    expect(resolvePrimaryHostname([])).toBeNull();
    expect(resolvePrimaryHostname([{ hostname: "", isPrimary: true }])).toBeNull();
  });
});

describe("resolveOrgSlug", () => {
  const orgs = [
    { id: "org-1", slug: "test" },
    { id: "org-2", slug: "chicago" },
    { id: "org-3", slug: null },
  ];

  it("matches the org id and returns its slug", () => {
    expect(resolveOrgSlug(orgs, "org-1")).toBe("test");
    expect(resolveOrgSlug(orgs, "org-2")).toBe("chicago");
  });

  it("returns null for unknown orgs, missing slugs, or missing inputs", () => {
    expect(resolveOrgSlug(orgs, "org-3")).toBeNull();
    expect(resolveOrgSlug(orgs, "nope")).toBeNull();
    expect(resolveOrgSlug(orgs, null)).toBeNull();
    expect(resolveOrgSlug(null, "org-1")).toBeNull();
    expect(resolveOrgSlug(undefined, undefined)).toBeNull();
  });
});

describe("NearNetworkId", () => {
  it("is a mainnet/testnet union usable at runtime", () => {
    const networks: NearNetworkId[] = ["mainnet", "testnet"];
    expect(networks).toHaveLength(2);
  });
});
