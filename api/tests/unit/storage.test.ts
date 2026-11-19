import { Effect } from "effect";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLE_MIME_TYPES,
  buildBundleKey,
  bundleCacheControl,
  bundleContentType,
  computeObjectIntegrity,
  MemoryStorageClient,
  measureBase64,
  partitionBundleFiles,
  S3StorageClient,
  StorageHttpError,
  StorageLive,
  StorageTag,
  TransientStorageError,
  validateNamespacePart,
  validateObjectPath,
  validateUploadSize,
  withStorageRetries,
} from "../../src/services/storage";

describe("bundle name → response policy", () => {
  it("marks hashed chunks immutable and entrypoints revalidating", () => {
    expect(bundleCacheControl("ui.1234abcd5678ef90.js")).toContain("immutable");
    expect(bundleCacheControl("remoteEntry.js")).toContain("must-revalidate");
    expect(bundleCacheControl("remoteEntry.server.js")).toContain("must-revalidate");
    expect(bundleCacheControl("mf-manifest.json")).toContain("must-revalidate");
    expect(bundleCacheControl("index.html")).toContain("must-revalidate");
  });

  it("marks hashed entrypoints immutable regardless of base name", () => {
    expect(bundleCacheControl("remoteEntry.8f3ac1d2feedbeef.js")).toContain("immutable");
    expect(bundleCacheControl("remoteEntry.server.a71fb2c3d4e5f601.js")).toContain("immutable");
    expect(bundleCacheControl("mf-manifest.9d2e1a3b5c7d9021.json")).toContain("immutable");
    expect(bundleCacheControl("style.6c596dfcdd12ab34.css")).toContain("immutable");
  });

  it("derives content types from extensions", () => {
    expect(bundleContentType("remoteEntry.js")).toBe("text/javascript");
    expect(bundleContentType("styles.css")).toBe("text/css");
    expect(bundleContentType("plugin.manifest.json")).toBe("application/json");
    expect(bundleContentType("font.woff2")).toBe("font/woff2");
    expect(bundleContentType("unknown.bin")).toBe("application/octet-stream");
    expect(Object.keys(BUNDLE_MIME_TYPES).length).toBeGreaterThan(10);
  });
});

describe("namespace + object path validation", () => {
  it("accepts well-formed namespaces", () => {
    expect(validateNamespacePart("v1.citynode.near", "account")).toBe(true);
    expect(validateNamespacePart("citynode.app", "gateway")).toBe(true);
    expect(validateNamespacePart("my-plugin_1", "workspace")).toBe(true);
  });

  it("rejects malformed namespaces", () => {
    for (const [value, kind] of [
      ["../etc", "account"],
      [".", "gateway"],
      ["a/b", "workspace"],
      ["", "account"],
      ["a b", "gateway"],
    ] as const) {
      expect(validateNamespacePart(value, kind)).toBe(false);
    }
  });

  it("normalizes safe object paths into the workspace key", () => {
    expect(buildBundleKey("a.near", "app.dev", "ui", "remoteEntry.js")).toBe(
      "bundles/a.near/app.dev/ui/remoteEntry.js",
    );
    expect(buildBundleKey("a.near", "app.dev", "ui", "static/js/async/x.1234abcd.js")).toBe(
      "bundles/a.near/app.dev/ui/static/js/async/x.1234abcd.js",
    );
  });

  it("rejects traversal and absolute object paths", () => {
    for (const attempt of [
      "../etc/passwd",
      "/etc/passwd",
      "ui/../../package.json",
      "ui/..%2fpackage.json",
      "ui\\windows.js",
      "ui//double-slash.js",
      "ui/./dot.js",
      "",
    ]) {
      expect(validateObjectPath(attempt)).toBeNull();
    }
  });

  it("enforces the upload size ceiling", () => {
    expect(validateUploadSize([10, 20], 100)).toBe(true);
    expect(validateUploadSize([60, 60], 100)).toBe(false);
    expect(validateUploadSize([], 100)).toBe(true);
  });

  it("measures decoded size from valid base64 without decoding it", () => {
    for (const text of ["", "a", "ab", "abc", "abcd", "hello world"]) {
      const encoded = Buffer.from(text).toString("base64");
      expect(measureBase64(encoded)).toBe(text.length);
    }
    expect(measureBase64("QQ")).toBe(1);
    expect(measureBase64("QUI")).toBe(2);
  });

  it("rejects malformed base64", () => {
    for (const bad of ["!!!not*base64!!!", "QQ=", "Q", "QUJD=", "QQ===", "QU JD", "QU-_", "=QQ="]) {
      expect(measureBase64(bad)).toBeNull();
    }
  });

  it("splits hashed assets from fixed-name entry files, keeping order", () => {
    const names = [
      "mf-manifest.json",
      "static/js/main.1234abcd5678ef90.js",
      "remoteEntry.js",
      "static/css/app.6c596dfcdd12ab34.css",
      "index.html",
    ].map((path) => ({ name: path.split("/").pop() ?? path, path }));
    const { assets, entries } = partitionBundleFiles(names);
    expect(assets.map((file) => file.path)).toEqual([
      "static/js/main.1234abcd5678ef90.js",
      "static/css/app.6c596dfcdd12ab34.css",
    ]);
    expect(entries.map((file) => file.path)).toEqual([
      "mf-manifest.json",
      "remoteEntry.js",
      "index.html",
    ]);
  });
});

describe("integrity", () => {
  it("computes sha384 SRI over stored bytes", () => {
    const hash = computeObjectIntegrity(new TextEncoder().encode("hello"));
    expect(hash).toMatch(/^sha384-[A-Za-z0-9+/=]{64}$/);
  });
});

describe("StorageLive backend disclosure", () => {
  const STORAGE_ENV_KEYS = [
    "BOS_STORAGE_ENDPOINT",
    "BOS_STORAGE_BUCKET",
    "BOS_STORAGE_ACCESS_KEY_ID",
    "BOS_STORAGE_SECRET_ACCESS_KEY",
    "BOS_STORAGE_REGION",
  ] as const;
  let savedEnv: Record<string, string | undefined>;

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  const resolveBackend = (): Promise<"s3" | "memory"> =>
    Effect.runPromise(
      Effect.gen(function* () {
        const storage = yield* StorageTag;
        return storage.backend;
      }).pipe(Effect.provide(StorageLive)),
    );

  it("reports memory when BOS_STORAGE_* is unset (bytes lost on restart)", async () => {
    savedEnv = Object.fromEntries(STORAGE_ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of STORAGE_ENV_KEYS) delete process.env[key];

    await expect(resolveBackend()).resolves.toBe("memory");
  });

  it("reports s3 when BOS_STORAGE_* is configured", async () => {
    savedEnv = Object.fromEntries(STORAGE_ENV_KEYS.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      BOS_STORAGE_ENDPOINT: "https://r2.test",
      BOS_STORAGE_BUCKET: "bundles",
      BOS_STORAGE_ACCESS_KEY_ID: "test",
      BOS_STORAGE_SECRET_ACCESS_KEY: "test",
      BOS_STORAGE_REGION: "auto",
    });

    await expect(resolveBackend()).resolves.toBe("s3");
  });
});

describe("memory storage client", () => {
  it("round-trips objects with headers intact", async () => {
    const client = new MemoryStorageClient();
    const bytes = new TextEncoder().encode("export {}");
    await client.put({
      key: "bundles/a.near/app.dev/ui/remoteEntry.js",
      bytes,
      contentType: "text/javascript",
      cacheControl: "public, max-age=0, must-revalidate",
    });
    const got = await client.get("bundles/a.near/app.dev/ui/remoteEntry.js");
    expect(got).not.toBeNull();
    expect(got!.bytes).toEqual(bytes);
    expect(got!.contentType).toBe("text/javascript");
    expect(got!.cacheControl).toContain("must-revalidate");
    expect(await client.get("bundles/a.near/app.dev/ui/missing.js")).toBeNull();
  });
});

describe("withStorageRetries", () => {
  it("retries transient failures and succeeds on a later attempt", async () => {
    let calls = 0;
    const result = await withStorageRetries(async () => {
      calls += 1;
      if (calls < 3) throw new TransientStorageError("PUT key", "fetch failed (ECONNRESET)");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("exhausts attempts on persistent transient failures and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      withStorageRetries(async () => {
        calls += 1;
        throw new TransientStorageError("PUT key", "fetch failed (ECONNRESET)");
      }),
    ).rejects.toThrow(TransientStorageError);
    expect(calls).toBe(3);
  });

  it("fails fast on non-transient errors without retrying", async () => {
    let calls = 0;
    await expect(
      withStorageRetries(async () => {
        calls += 1;
        throw new StorageHttpError("PUT key", 403, "AccessDenied");
      }),
    ).rejects.toThrow(StorageHttpError);
    expect(calls).toBe(1);
  });
});

describe("S3StorageClient", () => {
  const originalFetch = globalThis.fetch;

  const client = new S3StorageClient(
    { accessKeyId: "test", secretAccessKey: "test", region: "auto" },
    { endpoint: "https://r2.test", bucket: "bundles" },
  );

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("retries a transient 500 and succeeds, surfacing the R2 error body on final failure", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('<?xml version="1.0"?><Error><Code>InternalError</Code></Error>', {
          status: 500,
        });
      }
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    await client.put({
      key: "bundles/a.near/app.dev/ui/remoteEntry.js",
      bytes: new Uint8Array(4),
      contentType: "text/javascript",
      cacheControl: "public",
    });
    expect(calls).toBe(2);

    globalThis.fetch = vi.fn(
      async () =>
        new Response('<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>', {
          status: 403,
        }),
    ) as unknown as typeof fetch;

    await expect(
      client.put({
        key: "bundles/a.near/app.dev/ui/denied.js",
        bytes: new Uint8Array(4),
        contentType: "text/javascript",
        cacheControl: "public",
      }),
    ).rejects.toThrow(/denied\.js failed: 403.*AccessDenied/s);
  });

  it("wraps network-level failures with the undici cause code", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }),
      });
    }) as unknown as typeof fetch;

    await expect(client.get("bundles/a.near/app.dev/ui/remoteEntry.js")).rejects.toThrow(
      /fetch failed \(ECONNRESET\)/,
    );
  });
});
