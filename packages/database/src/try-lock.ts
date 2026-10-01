import type { Pool, PoolClient } from "pg";
import { advisoryLockKey } from "./lock.js";

export type TryLockResult<T> = { acquired: false } | { acquired: true; value: T };
export type TryAdvisoryLock = <T>(
  key: string,
  deadline: number,
  run: (assertHeld?: () => void) => Promise<T>,
) => Promise<TryLockResult<T>>;

/** Dedicated lock pool: holders never consume connections needed for business writes. */
export function tryAdvisoryLockRunner(pool: Pool): TryAdvisoryLock {
  return async (key, deadline, run) => {
    const client = await connectBefore(pool, deadline);
    if (!client) return { acquired: false };
    const lockKey = advisoryLockKey(key);
    let locked = false;
    let broken = false;
    const onError = () => {
      broken = true;
    };
    const assertHeld = () => {
      if (broken) throw new Error("sponsor_lock_lost");
    };
    client.on("error", onError);
    try {
      try {
        if (Date.now() >= deadline) return { acquired: false };
        const query = {
          text: "SELECT pg_try_advisory_lock($1) AS locked",
          values: [lockKey],
          query_timeout: Math.max(1, deadline - Date.now()),
        };
        const result = await client.query<{ locked: boolean }>(query);
        locked = result.rows[0]?.locked === true;
      } catch {
        // A timed-out query may still acquire the lock server-side. Destroy this session.
        broken = true;
        return { acquired: false };
      }
      if (!locked || Date.now() >= deadline) return { acquired: false };
      assertHeld();
      const value = await run(assertHeld);
      assertHeld();
      return { acquired: true, value };
    } finally {
      if (locked && !broken) {
        broken = !(await unlock(client, lockKey));
      }
      client.removeListener("error", onError);
      client.release(broken);
    }
  };
}

async function connectBefore(pool: Pool, deadline: number): Promise<PoolClient | undefined> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connection = pool.connect().then((client) => {
    if (expired) {
      client.release();
      return undefined;
    }
    return client;
  });
  let client: PoolClient | undefined;
  try {
    client = await Promise.race([
      connection,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve(undefined);
        }, remaining);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
  return client;
}

async function unlock(client: PoolClient, lockKey: bigint): Promise<boolean> {
  try {
    const query = {
      text: "SELECT pg_advisory_unlock($1)",
      values: [lockKey],
      query_timeout: 1_000,
    };
    await client.query(query);
    return true;
  } catch {
    return false;
  }
}
