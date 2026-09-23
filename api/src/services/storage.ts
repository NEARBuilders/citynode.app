import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseTag } from "../db/layer";
import { bundleObjects } from "../db/schema";

export const DEFAULT_MAX_TOTAL_UPLOAD_BYTES = 64 * 1024 * 1024;

export const BUNDLE_PATH_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".map",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".wasm",
  ".txt",
  ".xml",
]);

export function validateBundlePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) return false;
  const last = segments[segments.length - 1]!;
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return false;
  return BUNDLE_PATH_EXTENSIONS.has(last.slice(dot).toLowerCase());
}

export function bundleIntegrity(bytes: Uint8Array): string {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

export interface BundleUploadFile {
  path: string;
  bytes: Buffer;
  contentType: string;
}

export interface BundleObjectRef {
  key: string;
  sha256: string;
  size: number;
  integrity: string;
}

export interface BundleObjectContent {
  bytes: Buffer;
  contentType: string;
  size: number;
  sha256: string;
}

export interface BundleStorage {
  put(prefix: string, files: BundleUploadFile[]): Promise<BundleObjectRef[]>;
  get(key: string): Promise<BundleObjectContent | null>;
}

export class StorageTag extends Context.Service<StorageTag, BundleStorage>()("api/Storage") {}

export const StorageLive = Layer.effect(
  StorageTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;
    const maxTotalBytes =
      Number(process.env.BOS_MAX_BUNDLE_UPLOAD_BYTES) > 0
        ? Number(process.env.BOS_MAX_BUNDLE_UPLOAD_BYTES)
        : DEFAULT_MAX_TOTAL_UPLOAD_BYTES;

    const service: BundleStorage = {
      put: async (prefix, files) => {
        if (files.length === 0) {
          throw new ORPCError("BAD_REQUEST", { message: "No files provided" });
        }

        let total = 0;
        for (const file of files) {
          if (!validateBundlePath(file.path)) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Invalid bundle path: ${file.path}`,
              data: { hint: "Relative path with an allowlisted asset extension" },
            });
          }
          total += file.bytes.byteLength;
        }
        if (total > maxTotalBytes) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Upload exceeds total size ceiling (${total} > ${maxTotalBytes} bytes)`,
          });
        }

        const refs: BundleObjectRef[] = [];
        for (const file of files) {
          const key = `bundles/${prefix}/${file.path}`;
          const sha256 = createHash("sha256").update(file.bytes).digest("hex");
          const integrity = bundleIntegrity(file.bytes);
          await db
            .insert(bundleObjects)
            .values({
              key,
              sha256,
              size: file.bytes.byteLength,
              contentType: file.contentType,
              bytes: file.bytes,
            })
            .onConflictDoUpdate({
              target: bundleObjects.key,
              set: {
                sha256,
                size: file.bytes.byteLength,
                contentType: file.contentType,
                bytes: file.bytes,
                uploadedAt: new Date(),
              },
            });
          refs.push({ key, sha256, size: file.bytes.byteLength, integrity });
        }
        return refs;
      },

      get: async (key) => {
        const [row] = await db
          .select()
          .from(bundleObjects)
          .where(eq(bundleObjects.key, key))
          .limit(1);
        if (!row) return null;
        return {
          bytes: Buffer.from(row.bytes),
          contentType: row.contentType,
          size: row.size,
          sha256: row.sha256,
        };
      },
    };

    return service;
  }),
);
