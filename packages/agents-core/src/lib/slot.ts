/**
 * Module-scope dependency slot.
 *
 * The server wires its infrastructure once at startup (`index.ts`) and reads it from anywhere in a
 * request. These factories are that mechanism, so each `lib/*` module does not hand-roll its own
 * mutable binding. `set` always accepts `undefined` so a caller can clear a slot; what differs is
 * what `get` does about it.
 */

export type Slot<T> = {
  set(next: T | undefined): void;
  get(): T;
};

/** Fails closed when startup did not configure it. Used for dependencies with no safe default. */
export function requiredSlot<T>(name: string): Slot<T> {
  let value: T | undefined;
  return {
    set(next) {
      value = next;
    },
    get() {
      if (value === undefined) throw new Error(`${name} is not configured`);
      return value;
    },
  };
}

/** A capability a deployment may legitimately leave off; absence is represented, not an error. */
export function optionalSlot<T>(): {
  set(next: T | undefined): void;
  get(): T | undefined;
} {
  let value: T | undefined;
  return {
    set(next) {
      value = next;
    },
    get() {
      return value;
    },
  };
}

/** A slot with a production default that a test may swap. `undefined` restores the default. */
export function defaultedSlot<T>(fallback: T): {
  set(next: T | undefined): void;
  get(): T;
} {
  let value: T | undefined;
  return {
    set(next) {
      value = next;
    },
    get() {
      return value ?? fallback;
    },
  };
}
