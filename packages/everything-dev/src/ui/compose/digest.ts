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
  ui?: { url?: string; integrity?: string };
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
      ui: remote.ui ? { url: remote.ui.url ?? null, integrity: remote.ui.integrity ?? null } : null,
      compose: remote.compose === true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return stableHash([`registry:v${registryVersion}`, JSON.stringify(versioned)].join("\n"));
}
