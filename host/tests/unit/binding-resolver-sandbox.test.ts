import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearBindingResolverCache,
  createBindingResolver,
} from "../../src/services/binding-resolver";
import type { RuntimeConfig } from "../../src/services/config";

async function startBindingsServer(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server = createServer((req, res) => {
    if (req.url?.includes("/api/tenants/bindings")) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end("[]");
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function createBaseConfig(hostUrl = "http://127.0.0.1:9"): RuntimeConfig {
  return {
    env: "production",
    account: "linktree.near",
    domain: "linktree.com",
    networkId: "mainnet",
    title: "Linktree",
    description: "Base runtime",
    repository: "https://github.com/example/linktree",
    host: {
      name: "host",
      url: hostUrl,
      entry: `${hostUrl}/mf-manifest.json`,
      source: "remote",
    },
    ui: {
      name: "ui",
      url: `${hostUrl}/ui`,
      entry: `${hostUrl}/ui/mf-manifest.json`,
      source: "remote",
      integrity: "sha384-base",
    },
    api: {
      name: "api",
      url: `${hostUrl}/api`,
      entry: `${hostUrl}/api/mf-manifest.json`,
      source: "remote",
    },
  } as unknown as RuntimeConfig;
}

function writeLeaseFile(dir: string, slug: string, url: string): string {
  const path = join(dir, "sandboxes.json");
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      leases: [
        {
          account: "t.near",
          gateway: "linktree.com",
          slug,
          url,
          hostPort: 40123,
          pgPort: 40124,
          image: "citynode-platform:spike",
          imageDigest: null,
          containers: [],
          network: "sandbox-net",
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  return path;
}

describe("binding resolver sandbox overlay", () => {
  let leaseDir: string;
  let bindingsApi: Awaited<ReturnType<typeof startBindingsServer>>;

  beforeEach(async () => {
    leaseDir = mkdtempSync(join(tmpdir(), "bos-sandbox-resolver-"));
    bindingsApi = await startBindingsServer();
    clearBindingResolverCache();
  });

  afterEach(async () => {
    rmSync(leaseDir, { recursive: true, force: true });
    delete process.env.BOS_SANDBOX;
    delete process.env.BOS_SANDBOX_LEASES;
    clearBindingResolverCache();
    await bindingsApi.stop();
  });

  it("flag off: sandbox hostnames never resolve via the lease file (golden)", async () => {
    delete process.env.BOS_SANDBOX;
    process.env.BOS_SANDBOX_LEASES = writeLeaseFile(leaseDir, "t", "http://localhost:40123");
    const resolver = createBindingResolver(createBaseConfig(bindingsApi.url));

    const binding = await resolver.resolve("t.linktree.com");
    expect(binding).toBeNull();
  });

  it("flag on: sandbox hostname resolves to a sandbox binding", async () => {
    process.env.BOS_SANDBOX = "1";
    process.env.BOS_SANDBOX_LEASES = writeLeaseFile(leaseDir, "t", "http://localhost:40123");
    const resolver = createBindingResolver(createBaseConfig());

    const binding = await resolver.resolve("t.linktree.com");
    expect(binding).not.toBeNull();
    expect(binding?.hostMode).toBe("sandbox");
    expect(binding?.sandboxUrl).toBe("http://localhost:40123");
    expect(binding?.accountId).toBe("t.near");
    expect(binding?.status).toBe("active");
  });

  it("flag on: base host never resolves to the sandbox lease", async () => {
    process.env.BOS_SANDBOX = "1";
    process.env.BOS_SANDBOX_LEASES = writeLeaseFile(leaseDir, "t", "http://localhost:40123");
    const resolver = createBindingResolver(createBaseConfig());

    expect(await resolver.resolve("linktree.com")).toBeNull();
    expect(await resolver.resolve("localhost")).toBeNull();
  });

  it("flag on: dev localhost labels map through the overlay", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    process.env.BOS_SANDBOX = "1";
    process.env.BOS_SANDBOX_LEASES = writeLeaseFile(leaseDir, "t", "http://localhost:40123");
    try {
      const resolver = createBindingResolver(createBaseConfig());
      const binding = await resolver.resolve("t.localhost");
      expect(binding?.hostMode).toBe("sandbox");
      expect(binding?.sandboxUrl).toBe("http://localhost:40123");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("flag on: non-lease hostnames fall through to the bindings API (empty map)", async () => {
    process.env.BOS_SANDBOX = "1";
    process.env.BOS_SANDBOX_LEASES = writeLeaseFile(leaseDir, "t", "http://localhost:40123");
    const resolver = createBindingResolver(createBaseConfig(bindingsApi.url));

    const binding = await resolver.resolve("other.linktree.com");
    expect(binding).toBeNull();
  });
});
