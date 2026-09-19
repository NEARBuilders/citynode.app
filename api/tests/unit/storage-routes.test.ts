import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ResponseHeadersHandlerPlugin } from "@orpc/server/plugins";
import { createPluginRuntime } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { contract } from "@/contract";
import Plugin from "@/index";
import pluginDevConfig from "../../plugin.dev";

const TEST_REGISTRY = {
  [pluginDevConfig.pluginId]: {
    module: Plugin,
    description: "API storage route test runtime",
  },
} as const;

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

interface HandlerBundle {
  handler: OpenAPIHandler<typeof contract>;
  effectContext: unknown;
}

async function freshHandler(): Promise<HandlerBundle> {
  const dir = mkdtempSync(join(tmpdir(), "api-storage-routes-"));
  activeDir = dir;

  const runtime = createPluginRuntime({ registry: TEST_REGISTRY, secrets: {} });
  const { router, initialized } = await runtime.usePlugin(pluginDevConfig.pluginId, {
    ...pluginDevConfig.config,
    secrets: {
      ...pluginDevConfig.config.secrets,
      API_DATABASE_URL: `pglite:${dir}`,
    },
  });

  const handler = new OpenAPIHandler(router, {
    plugins: [new ResponseHeadersHandlerPlugin()],
  });

  return {
    handler: handler as OpenAPIHandler<typeof contract>,
    effectContext: initialized.effectContext,
  };
}

function sri(bytes: Uint8Array): string {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

const SESSION_CONTEXT = {
  userId: "user-1",
  user: { id: "user-1", email: "user-1@example.com", name: "Test User", role: null },
  near: { primaryAccountId: "alice.near" },
};

async function upload(
  bundle: HandlerBundle,
  body: Record<string, unknown>,
  context: Record<string, unknown> = SESSION_CONTEXT,
): Promise<Response> {
  const result = await bundle.handler.handle(
    new Request("http://localhost/api/storage/bundles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    {
      prefix: "/api",
      context: { ...context, "effect/context": bundle.effectContext },
    } as never,
  );
  if (!result.response) throw new Error("Upload request did not match a route");
  return result.response;
}

async function serve(bundle: HandlerBundle, path: string): Promise<Response> {
  const result = await bundle.handler.handle(
    new Request(`http://localhost${path}`, { method: "GET" }),
    { prefix: "/", context: { "effect/context": bundle.effectContext } } as never,
  );
  if (!result.response) throw new Error(`Serve request did not match a route: ${path}`);
  return result.response;
}

const UPLOAD_BODY = {
  account: "alice.near",
  gateway: "citynode.app",
  workspace: "ui",
  paths: {
    "remoteEntry.js": {
      content: Buffer.from("console.log('bundle v1');", "utf8").toString("base64"),
      contentType: "application/javascript",
    },
  },
};

describe("POST /api/storage/bundles", () => {
  it("uploads, persists, and returns server-computed SRI", async () => {
    const bundle = await freshHandler();
    const response = await upload(bundle, UPLOAD_BODY);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      base: string;
      objects: { key: string; sha256: string; integrity: string }[];
    };
    expect(body.base).toBe("bundles/alice.near/citynode.app/ui");
    expect(body.objects).toHaveLength(1);
    expect(body.objects[0]!.key).toBe("bundles/alice.near/citynode.app/ui/remoteEntry.js");
    expect(body.objects[0]!.integrity).toBe(
      sri(new TextEncoder().encode("console.log('bundle v1');")),
    );
  });

  it("rejects unauthenticated uploads", async () => {
    const bundle = await freshHandler();
    const response = await upload(bundle, UPLOAD_BODY, {});

    expect(response.status).toBe(401);
  });

  it("rejects path traversal in uploaded keys", async () => {
    const bundle = await freshHandler();
    const response = await upload(bundle, {
      ...UPLOAD_BODY,
      paths: { "../evil.js": { content: "eA==", contentType: "application/javascript" } },
    });

    expect(response.status).toBe(400);
  });

  it("rejects uploads pinned to a different account than the session principal", async () => {
    const bundle = await freshHandler();
    const response = await upload(bundle, { ...UPLOAD_BODY, account: "mallory.near" });

    expect(response.status).toBe(403);
  });
});

describe("GET /bundles/{account}/{gateway}/{workspace}/{+path}", () => {
  it("serves stored bytes with content-type and immutable cache headers", async () => {
    const bundle = await freshHandler();
    const css = new TextEncoder().encode("body { color: red; }");
    await upload(bundle, {
      ...UPLOAD_BODY,
      paths: {
        "styles/main.css": {
          content: Buffer.from(css).toString("base64"),
          contentType: "text/css",
        },
      },
    });

    const response = await serve(bundle, "/bundles/alice.near/citynode.app/ui/styles/main.css");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(css);
  });

  it("returns 404 for unknown keys", async () => {
    const bundle = await freshHandler();
    const response = await serve(bundle, "/bundles/alice.near/citynode.app/ui/missing.js");

    expect(response.status).toBe(404);
  });
});
