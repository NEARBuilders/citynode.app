import { MOUNT_REGISTRY_VERSION } from "./digest-version";

/**
 * Universal (browser-safe) stable hash for compose digests. FNV-1a 32-bit,
 * folded twice with a varying prime offset, hex-encoded. Determinism is the
 * only requirement — collision resistance needs go no further because digest
 * inputs are integrity hashes (cryptographically strong) joined in a
 * canonical order.
 */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = (h1 + ((h1 << 1) | (h1 >>> 31)) + (h1 << 4) + (h1 << 5) + (h1 << 23)) >>> 0;
    h2 = (h2 * 31 + c) >>> 0;
    h2 = (h2 ^ (c << ((i % 8) + 1))) >>> 0;
  }
  h1 = h1 ^ (h1 >>> 16) ^ (h2 >>> 3);
  h2 = h2 ^ (h2 >>> 13) ^ (h1 >>> 5);
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}${(
    h2 ^ h1
  )
    .toString(16)
    .padStart(8, "0")}`;
}

export interface UiRemoteFingerprint {
  /** stable key for the remote (plugin id, or "core" for the shell) */
  id: string;
  ui?: {
    url?: string;
    integrity?: string;
    ssrUrl?: string;
    ssrIntegrity?: string;
  };
  /** composition enabled for this remote — visible on both client and server */
  compose?: boolean;
}

/**
 * Deterministic hash over the ui remotes' urls + integrity hashes + registry
 * version. Same fingerprint → the exact same set of remote modules → safe to
 * return the same composed tree object (client and server compositions stay
 * identical, hydrating before any new remote has been touched).
 */
export function computeComposeDigest(
  remotes: readonly UiRemoteFingerprint[],
  registryVersion: string,
): string {
  const versioned = [...remotes]
    .map((remote) => ({
      id: remote.id,
      ui: remote.ui
        ? {
            url: remote.ui.url ?? null,
            integrity: remote.ui.integrity ?? null,
            ssrUrl: remote.ui.ssrUrl ?? null,
            ssrIntegrity: remote.ui.ssrIntegrity ?? null,
          }
        : null,
      compose: remote.compose === true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return stableHash([`registry:v${registryVersion}`, JSON.stringify(versioned)].join("\n"));
}

export interface ComposeFingerprintConfig {
  ui?: { url?: string; integrity?: string };
  plugins?: Record<
    string,
    | { ui?: { url?: string; integrity?: string; ssrUrl?: string; ssrIntegrity?: string } }
    | undefined
  >;
}

/**
 * The single source of truth for "does this runtime compose plugin ui trees":
 * a plugin composes iff it has a server-side SSR entry the host can graft.
 * Server and client read this from the same module — the compose flag, the
 * composed set, and the digest can no longer drift between them.
 */
export function hasComposableUi(config: ComposeFingerprintConfig): boolean {
  return Object.values(config.plugins ?? {}).some((p) => Boolean(p?.ui?.ssrUrl));
}

/**
 * Digest over the full runtime config shape: the core ui remote plus every
 * plugin ui remote's url, integrity, ssrUrl and ssrIntegrity. Every input the
 * host loads by is also an input here, so a plugin redeploying only its SSR
 * bundle invalidates the cached composed tree.
 */
export function computeConfigComposeDigest(config: ComposeFingerprintConfig): string {
  return computeComposeDigest(
    [
      {
        id: "core",
        ui: { url: config.ui?.url, integrity: config.ui?.integrity },
        compose: hasComposableUi(config),
      },
      ...Object.entries(config.plugins ?? {}).map(([id, p]) => ({
        id,
        ui: p?.ui
          ? {
              url: p.ui.url,
              integrity: p.ui.integrity,
              ssrUrl: p.ui.ssrUrl,
              ssrIntegrity: p.ui.ssrIntegrity,
            }
          : undefined,
        compose: Boolean(p?.ui?.ssrUrl),
      })),
    ],
    MOUNT_REGISTRY_VERSION,
  );
}
