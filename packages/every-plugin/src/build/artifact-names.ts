import crypto from "node:crypto";
import { z } from "zod";

/** Fixed-name artifacts a redeploy replaces in place — they must revalidate. */
export const LEGACY_ENTRY_FILENAME = "remoteEntry.js";
export const LEGACY_SERVER_ENTRY_FILENAME = "remoteEntry.server.js";
export const LEGACY_MF_MANIFEST_FILENAME = "mf-manifest.json";
export const HASHED_ENTRY_PATTERN = "remoteEntry.[contenthash].js";
export const HASHED_SERVER_ENTRY_PATTERN = "remoteEntry.server.[contenthash].js";

/**
 * Whether this rsbuild invocation is a disk build (hashed entry names +
 * legacy aliases exist) or an in-memory dev server. Dev consumers — the
 * host's html shell, the compose client payload, the readiness probe —
 * append the legacy fixed name, so dev must emit exactly that name.
 */
export function isBuildInvocation(): boolean {
  return process.env.DEPLOY === "true" || process.env.NODE_ENV !== "development";
}

export function uiEntryFilename(input: { isBuild: boolean; server?: boolean }): string {
  if (!input.isBuild) return input.server ? LEGACY_SERVER_ENTRY_FILENAME : LEGACY_ENTRY_FILENAME;
  return input.server ? HASHED_SERVER_ENTRY_PATTERN : HASHED_ENTRY_PATTERN;
}
export const LEGACY_STYLE_FILENAME = "style.css";

const HASH_SEGMENT_PATTERN = /\.[a-f0-9]{8,}\./;

/**
 * Serving classification for bundle objects: anything whose name carries a
 * content-hash segment (including hashed entrypoints like
 * `remoteEntry.8f3a….js`) is immutable by construction; fixed-name
 * entrypoints and non-hashed files a redeploy replaces in place must
 * revalidate.
 */
export function isImmutableBundlePath(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return HASH_SEGMENT_PATTERN.test(base);
}

export function cacheControlOf(name: string): string {
  return isImmutableBundlePath(name)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate";
}

/** Short content hash used to mint additive hashed copies of fixed-name artifacts. */
export function contentHashOf(content: string | Uint8Array): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function hashedArtifactName(base: string, hash: string, ext: string): string {
  return `${base}.${hash}.${ext.replace(/^\./, "")}`;
}

/** Find the content-hashed entry asset for a base name ("remoteEntry", "remoteEntry.server"). */
export function planHashedEntry(
  assetNames: string[],
  base: string,
): { hashed: string; alias: string } | null {
  const hashed = assetNames.find((name) => {
    const rest = name.startsWith(`${base}.`) ? name.slice(base.length + 1) : null;
    if (rest === null) return false;
    const hash = rest.slice(0, -3);
    return name.endsWith(".js") && /^[a-f0-9]{8,}$/.test(hash);
  });
  if (!hashed) return null;
  return { hashed, alias: `${base}.js` };
}

export const BuildEntryReportSchema = z.object({
  entry: z.string().min(1),
  browserManifest: z.string().min(1).optional(),
  css: z.string().min(1).optional(),
});
export type BuildEntryReport = z.infer<typeof BuildEntryReportSchema>;

export interface ArtifactCopy {
  from: string;
  to: string;
}

/**
 * The additive-copy plan for one compiled dist root: the hashed entry asset
 * gets a legacy fixed-name alias (byte-identical, for consumers still
 * appending the fixed name), and each supplied fixed-name artifact gets an
 * immutable hashed copy. Returns null when the build predates hashed entry
 * names (only legacy names emitted) — nothing additive to do.
 */
export function planArtifactCopies(input: {
  assetNames: string[];
  entryBase: string;
  contents?: Record<string, string | Uint8Array | undefined>;
}): { copies: Array<ArtifactCopy>; report: BuildEntryReport } | null {
  const entry = planHashedEntry(input.assetNames, input.entryBase);
  if (!entry) return null;

  const copies: Array<ArtifactCopy> = [{ from: entry.hashed, to: entry.alias }];
  const report: BuildEntryReport = { entry: entry.hashed };

  const hashedCopy = (legacyName: string, reportField: "browserManifest" | "css") => {
    const content = input.contents?.[legacyName];
    if (content === undefined) return;
    const dot = legacyName.lastIndexOf(".");
    const base = legacyName.slice(0, dot);
    const ext = legacyName.slice(dot + 1);
    const hashed = hashedArtifactName(base, contentHashOf(content), ext);
    copies.push({ from: legacyName, to: hashed });
    report[reportField] = hashed;
  };
  hashedCopy(LEGACY_MF_MANIFEST_FILENAME, "browserManifest");
  hashedCopy(LEGACY_STYLE_FILENAME, "css");

  return { copies, report };
}
