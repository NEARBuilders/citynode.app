import { createHash } from "node:crypto";
import {
  type WorkspaceVersionManifest,
  WorkspaceVersionManifestSchema,
} from "every-plugin/version-manifest";

/**
 * Version-manifest slot resolution (atomic-deploys 04): a config slot's
 * `manifest` pointer (versioned filename + pinned SRI) resolves to the
 * derived entry-level fields every consumer needs. The cache is keyed by the
 * full pin — the pinned bytes are immutable, so a verified entry is cached
 * for the process lifetime and serves as last-known-good if the origin later
 * fails; a fetch or SRI failure with nothing cached propagates (a boot-time
 * resolution failure fails the deploy, which is the platform's rollback).
 */

export interface ResolvedSlotVersion {
  /** Absolute URL of the content-hashed container entry. */
  entryUrl: string;
  entryIntegrity: string;
  /** Absolute URL of the hashed browser manifest (mf-manifest), when present. */
  browserManifestUrl?: string;
  /** Absolute URL of the content-hashed SSR entry, when present. */
  ssrEntryUrl?: string;
  ssrIntegrity?: string;
}

const cache = new Map<string, ResolvedSlotVersion>();

export function clearSlotVersionCache(): void {
  cache.clear();
}

function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  return fetchImpl(url).then((response) => {
    if (!response.ok) throw new Error(`version manifest fetch failed: ${response.status}`);
    return response.text();
  });
}

export async function resolveSlotVersion(input: {
  base: string;
  manifest: string;
  integrity: string;
  fetchImpl?: typeof fetch;
}): Promise<ResolvedSlotVersion | null> {
  const key = `${input.base}::${input.manifest}::${input.integrity}`;
  // content-addressed: a verified pin is cached for the process lifetime and
  // never refetched — the cache IS the last-known-good
  const cached = cache.get(key);
  if (cached) return cached;

  const manifestUrl = `${input.base.replace(/\/$/, "")}/${input.manifest.replace(/^\//, "")}`;
  let manifest: WorkspaceVersionManifest;
  try {
    const body = await fetchText(manifestUrl, input.fetchImpl ?? fetch);
    const computed = `sha384-${createHash("sha384").update(body).digest("base64")}`;
    if (computed !== input.integrity) {
      throw new Error(
        `[SRI] version manifest integrity mismatch for ${manifestUrl}\n  Expected: ${input.integrity}\n  Computed: ${computed}`,
      );
    }
    manifest = WorkspaceVersionManifestSchema.parse(JSON.parse(body));
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  const resolved: ResolvedSlotVersion = {
    entryUrl: `${input.base.replace(/\/$/, "")}/${manifest.entry}`,
    entryIntegrity: manifest.entryIntegrity,
    ...(manifest.browserManifest
      ? {
          browserManifestUrl: `${input.base.replace(/\/$/, "")}/${manifest.browserManifest.file}`,
        }
      : {}),
    ...(manifest.ssr
      ? {
          ssrEntryUrl: `${input.base.replace(/\/$/, "")}/${manifest.ssr.entry}`,
          ssrIntegrity: manifest.ssr.integrity,
        }
      : {}),
  };
  cache.set(key, resolved);
  return resolved;
}
