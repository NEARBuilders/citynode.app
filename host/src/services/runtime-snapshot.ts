import { createHash } from "node:crypto";
import { Context, Effect, Layer, Ref } from "effect";
import type { RuntimeConfig } from "everything-dev/types";
import { ConfigService } from "./config";
import { createUiComposeCacheState, type UiComposeCacheState } from "./ui-compose";

export interface RuntimeSnapshotState {
  /** hash over the load-bearing slot coordinates — changes on every adopted deploy */
  fingerprint: string;
  config: RuntimeConfig;
  composeState: UiComposeCacheState;
}

/**
 * The swappable base state of the host's UI/SSR surfaces (atomic-deploys 06).
 * An atomic Ref: requests that already captured a state keep serving it while
 * new requests see the swapped one — session-level blue/green without any
 * draining machinery. API plugins and auth stay boot-frozen by design
 * (MAP decision 3); the fingerprint deliberately includes their coordinates
 * anyway — a published pointer that changed them is change-detection signal
 * for the watch fiber, even though a swap cannot adopt them.
 */
export class RuntimeSnapshot extends Context.Service<
  RuntimeSnapshot,
  {
    readonly get: Effect.Effect<RuntimeSnapshotState>;
    /** Atomically install the next state (ticket 07's transaction is the
     * fallible, pre-warmed path that produces it). */
    readonly swap: (next: RuntimeSnapshotState) => Effect.Effect<void>;
    /** Read-modify-write under the Ref: `f` returns the transaction's result
     * and the NEXT state; `f` throwing (a failed transaction step) leaves
     * the state untouched. */
    readonly modify: <A>(
      f: (state: RuntimeSnapshotState) => [A, RuntimeSnapshotState],
    ) => Effect.Effect<A>;
  }
>()("host/RuntimeSnapshot") {
  static readonly layer = Layer.effect(
    RuntimeSnapshot,
    Effect.gen(function* () {
      const config = yield* ConfigService;
      const ref = yield* Ref.make<RuntimeSnapshotState>({
        fingerprint: deploymentFingerprint(config),
        config,
        composeState: createUiComposeCacheState(),
      });
      return RuntimeSnapshot.of({
        get: Ref.get(ref),
        swap: (next) => Ref.set(ref, next),
        modify: (f) => Ref.modify(ref, (state) => f(state)),
      });
    }),
  );
}

/**
 * Deployment fingerprint: a stable hash over every load-bearing slot
 * coordinate (entryUrl + integrity per slot) — a new published deploy mints a
 * new fingerprint even when the composed digest is unchanged.
 */
export function deploymentFingerprint(config: RuntimeConfig): string {
  const parts: Array<string> = [];
  const slot = (
    prefix: string,
    s: { entryUrl?: string; integrity?: string; ssrIntegrity?: string } | undefined,
  ) => {
    if (!s) return;
    parts.push(`${prefix}:${s.entryUrl ?? ""}:${s.integrity ?? ""}:${s.ssrIntegrity ?? ""}`);
  };
  slot("ui", config.ui);
  slot("api", config.api);
  slot("auth", config.auth);
  for (const [key, plugin] of Object.entries(config.plugins ?? {})) {
    slot(`plugin.${key}`, plugin);
    slot(`plugin.${key}.ui`, plugin.ui);
  }
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}
