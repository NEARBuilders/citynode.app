import { AsyncLocalStorage } from "node:async_hooks";
import { randomInt } from "node:crypto";
import type { TryAdvisoryLock } from "@near-intents-agent-api/database";
import { ApiError } from "../shared/errors.js";
import { withAdvisoryLock } from "./db.js";

export type SponsorIdentity = { sponsor_account_id: string; sponsor_public_key: string };
const identity = new AsyncLocalStorage<{ identity: SponsorIdentity; assertHeld: () => void }>();
export const sponsorIdentity = () => {
  const lease = identity.getStore();
  lease?.assertHeld();
  return lease?.identity;
};

/** Admission has a deadline; once admitted, signing/finality has no queue timeout. */
export class SponsorPool<T> {
  private readonly context = new AsyncLocalStorage<{ value: T; assertHeld: () => void }>();
  private readonly active = new Set<string>();
  private cursor: number;
  private readonly nextProbe = new Map<string, number>();
  private waiting = 0;
  private rejected = 0;
  private waits = 0;
  private totalWaitMs = 0;
  private maxWaitMs = 0;

  constructor(
    readonly accountId: string,
    private readonly keys: { publicKey: string; value: T }[],
    private readonly lock: TryAdvisoryLock,
    private readonly waitMs: number,
    private readonly maxQueue: number,
  ) {
    if (!keys.length || new Set(keys.map((key) => key.publicKey)).size !== keys.length)
      throw new Error("sponsor_pool_keys_invalid");
    if (!Number.isInteger(waitMs) || waitMs < 1 || !Number.isInteger(maxQueue) || maxQueue < 1)
      throw new Error("sponsor_pool_limits_invalid");
    this.cursor = randomInt(keys.length);
  }

  current(): T {
    const value = this.context.getStore();
    if (!value) throw new Error("sponsor_key_lease_required");
    value.assertHeld();
    return value.value;
  }

  snapshot() {
    return {
      size: this.keys.length,
      queue_depth: this.waiting,
      active: this.active.size,
      rejected: this.rejected,
      lock_wait_count: this.waits,
      lock_wait_total_ms: this.totalWaitMs,
      lock_wait_max_ms: this.maxWaitMs,
    };
  }

  private canProbe(publicKey: string) {
    return !this.active.has(publicKey) && (this.nextProbe.get(publicKey) ?? 0) <= Date.now();
  }

  async run<R>(run: () => Promise<R>): Promise<R> {
    const current = this.context.getStore();
    if (current) {
      current.assertHeld();
      return run();
    }
    if (this.waiting >= this.maxQueue) {
      this.rejected++;
      throw new ApiError("sponsor_busy", 503);
    }
    const started = Date.now();
    const deadline = started + this.waitMs;
    this.waiting++;
    let queued = true;
    try {
      while (Date.now() < deadline) {
        const offset = this.cursor++ % this.keys.length;
        for (let index = 0; index < this.keys.length; index++) {
          const key = this.keys[(offset + index) % this.keys.length];
          if (!key || !this.canProbe(key.publicKey)) continue;
          this.active.add(key.publicKey);
          try {
            const result = await this.lock(
              `sponsor:${this.accountId}:${key.publicKey}`,
              deadline,
              async (assertHeld = () => {}) => {
                // Also fence a lock adapter that finishes acquisition after admission expired.
                if (Date.now() >= deadline) {
                  this.rejected++;
                  throw new ApiError("sponsor_busy", 503);
                }
                this.waiting--;
                queued = false;
                const waited = Date.now() - started;
                this.waits++;
                this.totalWaitMs += waited;
                this.maxWaitMs = Math.max(this.maxWaitMs, waited);
                return identity.run(
                  {
                    identity: {
                      sponsor_account_id: this.accountId,
                      sponsor_public_key: key.publicKey,
                    },
                    assertHeld,
                  },
                  () => this.context.run({ value: key.value, assertHeld }, run),
                );
              },
            );
            if (result.acquired) return result.value;
            this.nextProbe.set(key.publicKey, Date.now() + 25);
          } finally {
            this.active.delete(key.publicKey);
          }
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(25, Math.max(0, deadline - Date.now()))),
        );
      }
      this.rejected++;
      throw new ApiError("sponsor_busy", 503);
    } finally {
      if (queued) this.waiting--;
    }
  }
}

let configured: SponsorPool<unknown> | undefined;
export function configureSponsorPool(pool: SponsorPool<unknown> | undefined) {
  configured = pool;
}
export function sponsorPoolMetrics() {
  return configured?.snapshot() ?? { size: 0, queue_depth: 0, active: 0 };
}
export function withSponsorKey<T>(accountId: string, run: () => Promise<T>): Promise<T> {
  if (!configured) return withAdvisoryLock(accountId, run);
  if (configured.accountId !== accountId) throw new Error("sponsor_account_mismatch");
  return configured.run(run);
}
