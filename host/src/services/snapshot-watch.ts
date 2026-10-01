import { createHash } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import { fetchBosConfigFromFastKv } from "everything-dev/fastkv";
import { verifySriForUrl } from "everything-dev/integrity";
import type { BosConfig, RuntimeConfig } from "everything-dev/types";
import { logger } from "../utils/logger";
import { ConfigService } from "./config";
import { RuntimeSnapshot } from "./runtime-snapshot";
import { SnapshotCoordinator } from "./snapshot-coordinator";

export const DEFAULT_WATCH_INTERVAL_MS = 30_000;

/** Read BOS_SNAPSHOT_WATCH_INTERVAL_MS with the 30s default. */
export function watchIntervalMs(): number {
  const raw = Number(process.env.BOS_SNAPSHOT_WATCH_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WATCH_INTERVAL_MS;
}

/**
 * The published pointer's version identity: a hash over every slot's
 * `manifest`/`integrity` pair — cheap to compute (no version-manifest fetch),
 * and stable exactly when the deployed set is. A pointer-fingerprint change
 * is what triggers the adopt transaction.
 */
export function pointerFingerprint(config: BosConfig): string {
  const parts: Array<string> = [];
  const slot = (prefix: string, s: { manifest?: unknown; integrity?: unknown } | undefined) => {
    if (!s) return;
    parts.push(
      `${prefix}:${typeof s.manifest === "string" ? s.manifest : ""}:${typeof s.integrity === "string" ? s.integrity : ""}`,
    );
  };
  for (const [key, entry] of Object.entries(config.app ?? {})) {
    slot(`app.${key}`, entry);
    const ui = (entry as { ui?: { manifest?: unknown; integrity?: unknown } }).ui;
    slot(`app.${key}.ui`, ui);
  }
  for (const [key, entry] of Object.entries(config.plugins ?? {})) {
    if (typeof entry === "string") {
      parts.push(`plugins.${key}:${entry}`);
      continue;
    }
    slot(`plugins.${key}`, entry);
    const ui = (entry as { ui?: { manifest?: unknown; integrity?: unknown } }).ui;
    slot(`plugins.${key}.ui`, ui);
  }
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export interface WatchTickDeps {
  snapshot: RuntimeSnapshot["Service"];
  adopt: (published: BosConfig) => Promise<{ status: string }>;
  fetchPointer: () => Promise<BosConfig | null>;
  verifyEntries: (config: RuntimeConfig) => Promise<void>;
  lastSeen: string | undefined;
}

/**
 * One watch tick (atomic-deploys 08): fetch the published pointer; a
 * fingerprint change → the adopt transaction (derive → pre-warm → verify →
 * swap — the adopt's own SRI pass covers the entries it adopts). An adopt
 * failure logs and leaves `lastSeen` unchanged so the next tick retries.
 * On the unchanged-pointer path the current entries are SRI-verified each
 * tick; a verification failure there means the pinned bytes are wrong on the
 * serving side for an unchanged pointer — alert (the greppable
 * `[IntegrityMonitor] INTEGRITY FAILURE` string, kept for the regression
 * suite).
 */
export const runWatchTick = (
  deps: WatchTickDeps,
): Effect.Effect<{ lastSeen: string | undefined }> =>
  Effect.gen(function* () {
    const state = yield* deps.snapshot.get;
    const config = state.config;

    const pointer = yield* Effect.tryPromise(() => deps.fetchPointer()).pipe(
      Effect.catch((cause) => {
        logger.warn(
          `[SnapshotWatch] pointer fetch failed: ${cause instanceof Error ? cause.message : cause}`,
        );
        return Effect.succeed(null);
      }),
    );
    if (!pointer) return { lastSeen: deps.lastSeen };

    const fingerprint = pointerFingerprint(pointer);
    if (fingerprint !== deps.lastSeen) {
      const adopted = yield* Effect.tryPromise(() => deps.adopt(pointer)).pipe(
        Effect.map((outcome) => {
          if (outcome.status === "swapped") {
            logger.info(`[SnapshotWatch] snapshot swapped to ${fingerprint}`);
          }
          return true as const;
        }),
        Effect.catch((cause) => {
          logger.error(
            `[SnapshotWatch] adopt failed for ${fingerprint} — retrying next tick:`,
            cause instanceof Error ? cause.message : cause,
          );
          return Effect.succeed(false as const);
        }),
      );
      return { lastSeen: adopted ? fingerprint : deps.lastSeen };
    }

    yield* Effect.tryPromise(() => deps.verifyEntries(config)).pipe(
      Effect.catch((cause) => {
        logger.error(
          `[IntegrityMonitor] INTEGRITY FAILURE for ${config.account}/${config.domain ?? ""}:`,
          cause instanceof Error ? cause.message : cause,
        );
        return Effect.void;
      }),
    );
    return { lastSeen: deps.lastSeen };
  });

interface VerifyTarget {
  key: string;
  url?: string;
  integrity?: string;
  extendsRef?: string;
  /** true when the URL IS the (hashed) entry — no fixed-name resolution */
  direct?: boolean;
}

/**
 * SRI-verify the live slots against their derived pins (the monitor's old
 * job, ported): own pins for manifest slots; extends-ref slots re-read the
 * PARENT config from FastKV and verify against the parent's latest
 * integrity — an upstream republish is noticed without a restart.
 */
async function verifyCurrentEntries(config: RuntimeConfig): Promise<void> {
  const targets: Array<VerifyTarget> = [
    {
      key: "ui",
      url: config.ui.entryUrl ?? config.ui.url,
      integrity: config.ui.integrity,
      direct: Boolean(config.ui.entryUrl),
    },
    ...(config.ui.ssrEntryUrl
      ? [
          {
            key: "ui-ssr",
            url: config.ui.ssrEntryUrl,
            integrity: config.ui.ssrIntegrity,
            direct: true,
          },
        ]
      : []),
    ...(config.api?.url
      ? [
          {
            key: "api",
            url: config.api.entryUrl ?? config.api.url,
            integrity: config.api.integrity,
            direct: Boolean(config.api.entryUrl),
          },
        ]
      : []),
    ...(config.auth?.url
      ? [
          {
            key: "auth",
            url: config.auth.entryUrl ?? config.auth.url,
            integrity: config.auth.integrity,
            extendsRef: config.auth.extendsRef,
            direct: Boolean(config.auth.entryUrl),
          },
        ]
      : []),
  ];
  for (const [key, plugin] of Object.entries(config.plugins ?? {})) {
    if (plugin?.url) {
      targets.push({
        key,
        url: plugin.entryUrl ?? plugin.url,
        integrity: plugin.integrity,
        extendsRef: plugin.extendsRef,
        direct: Boolean(plugin.entryUrl),
      });
    }
    if (plugin?.ui?.url) {
      targets.push({
        key: `${key}-ui`,
        url: plugin.ui.entryUrl ?? plugin.ui.url,
        integrity: plugin.ui.integrity,
        extendsRef: plugin.extendsRef,
        direct: Boolean(plugin.ui.entryUrl),
      });
    }
  }

  for (const target of targets) {
    if (!target.url) continue;
    if (target.extendsRef) {
      const parentConfig = await fetchBosConfigFromFastKv<Record<string, unknown>>(
        target.extendsRef,
      );
      const latestIntegrity = getIntegrityForExtends(parentConfig, target.key);
      if (latestIntegrity) {
        await verifySriForUrl(target.url, latestIntegrity, { resolveEntryUrl: !target.direct });
      }
      continue;
    }
    if (target.integrity) {
      await verifySriForUrl(target.url, target.integrity, { resolveEntryUrl: !target.direct });
    }
  }
}

function getIntegrityForExtends(config: Record<string, unknown>, key: string): string | undefined {
  const targetPath =
    key === "ui"
      ? "app.ui"
      : key === "auth"
        ? "app.auth"
        : key.endsWith("-ui")
          ? `plugins.${key.slice(0, -3)}.ui`
          : `plugins.${key}`;

  let current: unknown = config;
  for (const part of targetPath.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (current && typeof current === "object") {
    return (current as Record<string, unknown>).integrity as string | undefined;
  }
  return undefined;
}

/**
 * The supervised watch fiber (atomic-deploys 08) — replaces the old
 * setInterval integrity monitor: a scope-owned loop polling the published
 * pointer + verifying the current entries. Production-only (dev has no
 * published pointer; the boot config is the truth there).
 */
export class SnapshotWatch extends Context.Service<
  SnapshotWatch,
  { readonly tick: Effect.Effect<{ lastSeen: string | undefined }> }
>()("host/SnapshotWatch") {
  static readonly layer = (intervalMs = watchIntervalMs()) =>
    Layer.effect(
      SnapshotWatch,
      Effect.gen(function* () {
        const snapshot = yield* RuntimeSnapshot;
        const coordinator = yield* SnapshotCoordinator;
        const config = yield* ConfigService;

        let lastSeen: string | undefined;
        const tick = Effect.gen(function* () {
          const result = yield* runWatchTick({
            snapshot,
            adopt: (published) => Effect.runPromise(coordinator.adopt(published)),
            fetchPointer: () =>
              fetchBosConfigFromFastKv<BosConfig>(
                `bos://${config.account}/${config.domain ?? "everything.dev"}`,
              ).catch(() => null),
            verifyEntries: (current) => verifyCurrentEntries(current),
            lastSeen,
          });
          lastSeen = result.lastSeen;
          return result;
        });

        if (config.env !== "production") {
          logger.info(
            "[SnapshotWatch] disabled outside production (boot config is the truth in dev)",
          );
          return SnapshotWatch.of({ tick });
        }

        logger.info(
          `[SnapshotWatch] watching bos://${config.account}/${config.domain ?? "everything.dev"} every ${intervalMs / 1000}s`,
        );
        yield* Effect.forkScoped(
          Effect.forever(Effect.flatMap(Effect.sleep(intervalMs), () => tick)),
        );
        return SnapshotWatch.of({ tick });
      }),
    );
}
