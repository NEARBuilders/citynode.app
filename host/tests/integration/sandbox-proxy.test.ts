import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearBindingResolverCache } from "../../src/services/binding-resolver";
import { getAvailablePort } from "../helpers/ports";

const SANDBOX_MARKER = "SANDBOX_RENDERED";

function createBaseConfig(hostUrl: string) {
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
      proxy: hostUrl,
    },
  };
}

async function startServer(
  handler: (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ) => void,
) {
  const port = await getAvailablePort();
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function leaseRecord(url: string, slug = "t") {
  return {
    account: "t.near",
    gateway: "linktree.com",
    slug,
    url,
    hostPort: 0,
    pgPort: 0,
    image: "citynode-platform:spike",
    imageDigest: null,
    containers: [],
    network: "sandbox-net",
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
}

describe("sandbox proxy middleware", () => {
  const previousSandbox = process.env.BOS_SANDBOX;
  const previousLeases = process.env.BOS_SANDBOX_LEASES;
  let leaseDir: string;

  beforeAll(() => {
    leaseDir = mkdtempSync(join(tmpdir(), "bos-sandbox-proxy-"));
  });

  afterAll(() => {
    rmSync(leaseDir, { recursive: true, force: true });
    if (previousSandbox === undefined) delete process.env.BOS_SANDBOX;
    else process.env.BOS_SANDBOX = previousSandbox;
    if (previousLeases === undefined) delete process.env.BOS_SANDBOX_LEASES;
    else process.env.BOS_SANDBOX_LEASES = previousLeases;
  });

  it("proxies the whole request for a sandbox binding when BOS_SANDBOX=1", async () => {
    process.env.BOS_SANDBOX = "1";
    clearBindingResolverCache();

    const sandboxServer = await startServer((req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html");
      res.end(`${SANDBOX_MARKER}:${req.url}`);
    });
    const leasePath = join(leaseDir, "sandboxes.json");
    writeFileSync(
      leasePath,
      JSON.stringify({ version: 1, leases: [leaseRecord(sandboxServer.baseUrl)] }),
    );
    process.env.BOS_SANDBOX_LEASES = leasePath;

    const sharedHost = await startServer((req, res) => {
      if (req.url?.includes("/api/tenants/bindings")) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end("[]");
        return;
      }
      res.statusCode = 404;
      res.end("shared host");
    });

    const { runServer } = await import("../../src/program");
    const port = await getAvailablePort();
    const handle = runServer({
      config: createBaseConfig(sharedHost.baseUrl) as any,
      port,
    });
    await handle.ready;

    try {
      const tenantRequest = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { "x-forwarded-host": "t.linktree.com" },
      });
      expect(await tenantRequest.text()).toContain(SANDBOX_MARKER);

      const apiRequest = await fetch(`http://127.0.0.1:${port}/api/whatever`, {
        headers: { "x-forwarded-host": "t.linktree.com" },
      });
      expect(await apiRequest.text()).toContain(SANDBOX_MARKER);

      const baseRequest = await fetch(`http://127.0.0.1:${port}/health`);
      const baseBody = await baseRequest.text();
      expect(baseBody).not.toContain(SANDBOX_MARKER);
    } finally {
      await handle.shutdown();
      await sandboxServer.stop();
      await sharedHost.stop();
    }
  });

  it("flag off: the same hostname is not proxied (golden)", async () => {
    delete process.env.BOS_SANDBOX;
    process.env.BOS_SANDBOX_LEASES = join(leaseDir, "sandboxes.json");
    writeFileSync(
      process.env.BOS_SANDBOX_LEASES,
      JSON.stringify({ version: 1, leases: [leaseRecord("http://localhost:9")] }),
    );
    clearBindingResolverCache();

    const sandboxServer = await startServer((req, res) => {
      res.statusCode = 200;
      res.end(`${SANDBOX_MARKER}:${req.url}`);
    });

    const sharedHost = await startServer((req, res) => {
      if (req.url?.includes("/api/tenants/bindings")) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end("[]");
        return;
      }
      res.statusCode = 404;
      res.end("shared host");
    });

    const { runServer } = await import("../../src/program");
    const port = await getAvailablePort();
    const handle = runServer({
      config: createBaseConfig(sharedHost.baseUrl) as any,
      port,
    });
    await handle.ready;

    try {
      const tenantRequest = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { "x-forwarded-host": "t.linktree.com" },
      });
      expect(await tenantRequest.text()).not.toContain(SANDBOX_MARKER);
    } finally {
      await handle.shutdown();
      await sandboxServer.stop();
      await sharedHost.stop();
    }
  });
});
