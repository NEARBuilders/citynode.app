import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { Effect, Layer } from "effect";
import { buildScoped, PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseLive } from "@/db/layer";
import {
  type BundleStorage,
  StorageLive,
  StorageTag,
  validateBundlePath,
} from "@/services/storage";

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

async function withStorage<T>(fn: (storage: BundleStorage) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "api-storage-"));
  activeDir = dir;
  const database = DatabaseLive(`pglite:${dir}`);
  const layer = StorageLive.pipe(Layer.provide(database)).pipe(
    Layer.provide(Layer.succeed(PluginIdTag, "api")),
  );
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const storage = yield* buildScoped(StorageTag, layer);
        return yield* Effect.tryPromise({
          try: () => fn(storage),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        });
      }),
    ),
  );
}

function sri(bytes: Buffer): string {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

describe("validateBundlePath", () => {
  it("accepts allowlisted asset paths", () => {
    expect(validateBundlePath("remoteEntry.js")).toBe(true);
    expect(validateBundlePath("mf-manifest.json")).toBe(true);
    expect(validateBundlePath("static/js/chunk.abc123.js")).toBe(true);
    expect(validateBundlePath("assets/logo.svg")).toBe(true);
    expect(validateBundlePath("styles/main.css")).toBe(true);
  });

  it("rejects traversal and malformed paths", () => {
    expect(validateBundlePath("../escape.js")).toBe(false);
    expect(validateBundlePath("a/../../escape.js")).toBe(false);
    expect(validateBundlePath("/absolute.js")).toBe(false);
    expect(validateBundlePath("back\\slash.js")).toBe(false);
    expect(validateBundlePath("")).toBe(false);
    expect(validateBundlePath("dir//file.js")).toBe(false);
  });

  it("rejects disallowed extensions", () => {
    expect(validateBundlePath("secrets.env")).toBe(false);
    expect(validateBundlePath("index.php")).toBe(false);
    expect(validateBundlePath("noextension")).toBe(false);
  });
});

describe("BundleStorage", () => {
  it("round-trips bytes and computes SRI over stored bytes", async () => {
    const bytes = Buffer.from("console.log('hello bundle');", "utf8");

    const { ref, fetched } = await withStorage(async (storage) => {
      const [ref] = await storage.put("alice.near/citynode.app/ui", [
        { path: "remoteEntry.js", bytes, contentType: "application/javascript" },
      ]);
      return { ref: ref!, fetched: await storage.get(ref!.key) };
    });

    expect(ref.key).toBe("bundles/alice.near/citynode.app/ui/remoteEntry.js");
    expect(ref.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(ref.size).toBe(bytes.byteLength);
    expect(ref.integrity).toBe(sri(bytes));

    expect(fetched).not.toBeNull();
    expect(fetched!.bytes.equals(bytes)).toBe(true);
    expect(fetched!.contentType).toBe("application/javascript");
    expect(fetched!.sha256).toBe(ref.sha256);
  });

  it("rejects traversal paths on put", async () => {
    await expect(
      withStorage(async (storage) =>
        storage.put("alice.near/citynode.app/ui", [
          { path: "../escape.js", bytes: Buffer.from("x"), contentType: "text/javascript" },
        ]),
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("rejects total size ceiling violations", async () => {
    const big = Buffer.alloc(33 * 1024 * 1024, 1);
    await expect(
      withStorage(async (storage) =>
        storage.put("alice.near/citynode.app/ui", [
          { path: "a.js", bytes: big, contentType: "text/javascript" },
          { path: "b.js", bytes: big, contentType: "text/javascript" },
        ]),
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("returns null for missing keys", async () => {
    const missing = await withStorage((storage) =>
      storage.get("bundles/alice.near/citynode.app/ui/missing.js"),
    );
    expect(missing).toBeNull();
  });

  it("overwrites same key idempotently", async () => {
    const first = Buffer.from("v1", "utf8");
    const second = Buffer.from("v2", "utf8");

    const fetched = await withStorage(async (storage) => {
      await storage.put("alice.near/citynode.app/ui", [
        { path: "remoteEntry.js", bytes: first, contentType: "application/javascript" },
      ]);
      await storage.put("alice.near/citynode.app/ui", [
        { path: "remoteEntry.js", bytes: second, contentType: "application/javascript" },
      ]);
      return storage.get("bundles/alice.near/citynode.app/ui/remoteEntry.js");
    });

    expect(fetched!.bytes.equals(second)).toBe(true);
  });
});
