import type { Pool } from "pg";
import type { Db } from "./client.js";
import type { TryAdvisoryLock } from "./try-lock.js";

export type DatabaseHandle = {
  db: Db;
  close(): Promise<void>;
  tryAdvisoryLock?: TryAdvisoryLock;
  /**
   * Runs `run` while holding a Postgres session advisory lock derived from `key`.
   *
   * One pooled client is held for the whole critical section, because a session advisory lock
   * belongs to the connection that took it — releasing through a different pooled client would
   * silently fail and leak the lock. Callers must keep `run` short. Postgres also releases the
   * lock if the connection dies mid-flight.
   */
  withAdvisoryLock<T>(key: string, run: () => Promise<T>): Promise<T>;
};

/** Stable signed 64-bit advisory-lock key from an arbitrary string. */
export function advisoryLockKey(key: string): bigint {
  // FNV-1a over UTF-8 bytes, folded into the signed bigint range Postgres accepts.
  let hash = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(key, "utf8")) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return BigInt.asIntN(64, hash);
}

/**
 * Session advisory locks, queued in-process per key first.
 *
 * A waiter blocks inside `pg_advisory_lock` while holding a pooled connection. Without the local
 * queue, a burst of callers on one replica can take every pooled connection while they wait, and
 * the lock holder, which needs connections to finish its critical section, then starves until the
 * pool's connection timeout fails it. Queuing locally keeps at most one connection per key per
 * process waiting on Postgres; Postgres still serializes across processes and replicas.
 */
export function advisoryLockRunner(pool: Pool) {
  const tails = new Map<string, Promise<void>>();
  return async function withAdvisoryLock<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => turn);
    tails.set(key, tail);
    await previous;
    try {
      return await holdSessionLock(pool, key, run);
    } finally {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}

async function holdSessionLock<T>(pool: Pool, key: string, run: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const lockKey = advisoryLockKey(key);
  try {
    await client.query("SELECT pg_advisory_lock($1)", [lockKey]);
    try {
      return await run();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
    }
  } finally {
    client.release();
  }
}
