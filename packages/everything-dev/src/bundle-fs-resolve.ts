import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";

/**
 * Local-first bundle resolution (ADR 0011 amendment): a self-contained
 * runtime image stages its own namespace under `BOS_BUNDLE_DIR` as
 * `bundles/<account>/<gateway>/<workspace>/…` and consumes those bytes
 * directly from disk instead of round-tripping through its own public
 * origin. The registry tier (children, `BOS_BUNDLE_DIR` unset) keeps the
 * network fetch — the namespace guard below only ever matches the runtime's
 * own account/gateway, never another runtime's layout.
 */

export interface BundleNamespace {
  readonly bundleDir: string;
  readonly account: string;
  readonly gateway: string;
}

export class BundleReadError extends Schema.TaggedError<BundleReadError>()("BundleReadError", {
  path: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

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

const notFound = (): Response =>
  new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });

export function bundleUrlToLocalPath(url: string, namespace: BundleNamespace): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const prefix = `/bundles/${encodeURIComponent(namespace.account)}/${encodeURIComponent(namespace.gateway)}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  let rest: string;
  try {
    rest = decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
  if (!rest || rest.endsWith("/")) return null;

  // BOS_BUNDLE_DIR holds `<account>/<gateway>/<workspace>/…` directly (the
  // same layout host/src/routes/bundles.ts serves) — resolve and contain
  // within the OWN namespace, never a sibling one.
  const nsDir = path.resolve(namespace.bundleDir, namespace.account, namespace.gateway);
  const filePath = path.resolve(nsDir, rest);
  if (filePath !== nsDir && !filePath.startsWith(nsDir + path.sep)) return null;

  return filePath;
}

export class BundleResolver extends Context.Service<
  BundleResolver,
  {
    /** Resolve a fetch target from the staged namespace; null = not our namespace, fall through. */
    readonly lookup: (input: string | URL | Request) => Effect.Effect<Response | null>;
  }
>()("everything-dev/bundle-fs-resolve/BundleResolver") {
  static layer(namespace: BundleNamespace): Layer.Layer<BundleResolver> {
    return Layer.effect(
      BundleResolver,
      Effect.gen(function* () {
        const respond = Effect.fn("BundleResolver.respond")(function* (
          url: string,
        ): Effect.fn.Return<Response | null, never> {
          const filePath = bundleUrlToLocalPath(url, namespace);
          if (!filePath) return null;
          const bytes = yield* Effect.tryPromise({
            try: () => readFile(filePath),
            catch: (cause) => new BundleReadError({ path: filePath, cause }),
          }).pipe(Effect.catchTag("BundleReadError", () => Effect.succeed(null)));
          if (bytes === null) return notFound();
          const name = path.basename(filePath);
          const contentType =
            MIME_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
          const entrypoint = ENTRYPOINT_PATTERN.test(name) || !/\.[a-f0-9]{8,}\./.test(name);
          return new Response(new Uint8Array(bytes), {
            headers: {
              "content-type": contentType,
              "cache-control": entrypoint
                ? "public, max-age=0, must-revalidate"
                : "public, max-age=31536000, immutable",
              etag: `"${Buffer.from(bytes.subarray(0, 4096)).toString("base64").slice(0, 24)}"`,
            },
          });
        });

        return BundleResolver.of({
          lookup: (input) => {
            const url =
              typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            return respond(url);
          },
        });
      }),
    );
  }
}

export interface BundleFetchHandle {
  readonly uninstall: () => Promise<void>;
}

type FetchImpl = typeof globalThis.fetch;

/**
 * Installs the resolver as a global fetch interceptor — the one seam every
 * boot-time consumer shares (config manifest discovery, contract-type
 * fetches, orchestrator host loading, MF remoteEntry/identity probes).
 * URLs outside the own namespace fall through to the original fetch
 * untouched, and the interceptor is inert when `BOS_BUNDLE_DIR` is unset.
 */
export function installGlobalBundleFetch(namespace: BundleNamespace): BundleFetchHandle {
  const runtime = ManagedRuntime.make(BundleResolver.layer(namespace));
  const original: FetchImpl = globalThis.fetch;
  const patched = ((input: Parameters<FetchImpl>[0], init?: Parameters<FetchImpl>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!bundleUrlToLocalPath(url, namespace)) {
      return original(input, init);
    }
    return runtime.runPromise(
      Effect.gen(function* () {
        const resolver = yield* BundleResolver;
        return yield* resolver.lookup(input);
      }),
    );
  }) as FetchImpl;
  const originalPreconnect = (original as Partial<FetchImpl>).preconnect;
  if (originalPreconnect) {
    patched.preconnect = originalPreconnect.bind(original);
  }
  globalThis.fetch = patched;
  return {
    uninstall: async () => {
      if (globalThis.fetch === patched) {
        globalThis.fetch = original;
      }
      await runtime.dispose();
    },
  };
}

/**
 * Boot-time installer for the CLI: derives the namespace from
 * `BOS_BUNDLE_DIR` plus the runtime identity (`BOS_ACCOUNT`/`BOS_GATEWAY`
 * registry env taking precedence over the bos.config.json fields). Never
 * throws — a missing or malformed identity leaves the default network
 * fetch in place.
 */
export function installBundleFetchFromEnv(input: {
  configPath?: string | null;
}): BundleFetchHandle | null {
  const bundleDir = process.env.BOS_BUNDLE_DIR;
  if (!bundleDir) return null;

  let configAccount: string | undefined;
  let configGateway: string | undefined;
  const configPath = input.configPath;
  if (configPath) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
        account?: string;
        domain?: string;
      };
      configAccount = parsed.account;
      configGateway = parsed.domain;
    } catch {
      // unreadable config — identity may still come from the registry env
    }
  }

  const account = process.env.BOS_ACCOUNT ?? configAccount;
  const gateway = process.env.BOS_GATEWAY ?? configGateway;
  if (!account || !gateway) return null;

  return installGlobalBundleFetch({ bundleDir, account, gateway });
}
