import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Context } from "hono";
import type { AuthVariables } from "../lib/auth";

type HonoEnv = { Variables: AuthVariables };

const MIME_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".html": "text/html",
  ".htm": "text/html",
  ".webmanifest": "application/manifest+json",
  ".md": "text/markdown",
  ".ts": "text/plain",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

/** Entrypoints are fixed-name files a redeploy replaces — they must revalidate. */
const ENTRYPOINT_PATTERN = /^(remoteEntry|remoteEntry\.server|mf-manifest|index|manifest\.gen)\./;

/**
 * FS-backed bundle serving (plan 043): the runtime image stages its own
 * artifacts under `bundles/<account>/<gateway>/<workspace>/…` and the host
 * serves them same-origin — no bundle database, no upload credentials, no
 * CDN dependency. `BOS_BUNDLE_DIR` points at the staged root; unset (e.g.
 * a dev stack) falls through to whatever handles `/bundles/*` next.
 */
export function createBundleFsHandler(bundleDir: string | undefined) {
  return async (c: Context<HonoEnv>, next: () => Promise<void>) => {
    if (!bundleDir) {
      return next();
    }

    const relative = c.req.path.replace(/^\/bundles\//, "");
    if (!relative || relative.endsWith("/")) {
      return c.notFound();
    }

    // resolve + containment guard — reject traversal before touching disk
    const rootDir = path.resolve(bundleDir);
    const filePath = path.resolve(rootDir, relative);
    if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
      return c.text("Forbidden", 403);
    }

    try {
      const bytes = await readFile(filePath);
      const name = path.basename(filePath);
      const contentType =
        MIME_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
      // content-hashed chunks are immutable; fixed-name entrypoints must
      // revalidate or a redeploy never reaches returning clients
      const entrypoint = ENTRYPOINT_PATTERN.test(name) || !/\.[a-f0-9]{8,}\./.test(name);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": contentType,
          "cache-control": entrypoint
            ? "public, max-age=0, must-revalidate"
            : "public, max-age=31536000, immutable",
          etag: `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`,
        },
      });
    } catch {
      return c.notFound();
    }
  };
}
