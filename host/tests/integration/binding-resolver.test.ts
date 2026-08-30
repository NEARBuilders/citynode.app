import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBindingResolverCache,
  createBindingResolver,
  type TenantBinding,
} from "../../src/services/binding-resolver";
import type { RuntimeConfig } from "../../src/services/config";

const config: RuntimeConfig = {
  env: "production",
  account: "citynode.near",
  domain: "citynode.app",
  networkId: "mainnet",
  host: {
    name: "host",
    url: "https://citynode.app",
    entry: "https://citynode.app/mf-manifest.json",
    source: "remote",
  },
  ui: {
    name: "ui",
    url: "https://ui.example.com",
    entry: "https://ui.example.com/mf-manifest.json",
    source: "remote",
  },
  api: {
    name: "api",
    url: "https://api.example.com",
    entry: "https://api.example.com/mf-manifest.json",
    source: "remote",
  },
  plugins: {},
};

function binding(hostname: string): TenantBinding {
  return {
    hostname,
    tenantId: hostname,
    accountId: "chicago.near",
    allowUiOverrides: true,
    allowBackendOverrides: false,
    allowSsr: false,
    status: "active",
  };
}

describe("tenant binding hostnames", () => {
  beforeEach(() => clearBindingResolverCache());
  afterEach(() => vi.unstubAllGlobals());

  it("resolves aliases under the gateway and custom domains by their full hostname", async () => {
    const bindings = [binding("chicago"), binding("nyc.gov"), binding("full.citynode.app")];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(bindings))));
    const resolver = createBindingResolver(config);
    expect(await resolver.resolve("chicago.citynode.app")).toMatchObject({ hostname: "chicago" });
    expect(await resolver.resolve("NYC.GOV")).toMatchObject({ hostname: "nyc.gov" });
    expect(await resolver.resolve("full.citynode.app")).toMatchObject({
      hostname: "full.citynode.app",
    });
    expect(await resolver.resolve("nyc.gov.citynode.app")).toBeNull();
    expect(await resolver.resolve("citynode.app")).toBeNull();
  });
});
