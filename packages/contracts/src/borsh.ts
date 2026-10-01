/**
 * Little-endian Borsh writers shared by every wallet-state and offchain-message encoder.
 *
 * These bytes are hashed into signed wire formats (NEP-616/EIP-712 wallet ids, NEP-641
 * challenges), so a change here changes what an owner's signature commits to. The outputs are
 * pinned against near/intents Rust contract vectors in `tests/unit/owner`.
 */

export function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** `u32`: 4-byte little-endian unsigned. */
export function borshU32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

/** `u64`: 8-byte little-endian unsigned. */
export function borshU64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

/** `u128`: 16-byte little-endian unsigned. */
export function borshU128(value: bigint): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, value & ((1n << 64n) - 1n), true);
  view.setBigUint64(8, value >> 64n, true);
  return bytes;
}

/** Width-checked little-endian integer, for the field sizes the wallet contract declares. */
export function borshInteger(value: bigint, size: 8 | 16): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(size * 8)) throw new Error("wallet_integer_out_of_range");
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++)
    bytes[index] = Number((value >> BigInt(8 * index)) & 255n);
  return bytes;
}

/** `Vec<u8>`: 4-byte length prefix followed by the raw bytes. */
export function borshBytes(value: Uint8Array): Uint8Array {
  return concat(borshU32(value.length), value);
}

/** `String`: length-prefixed UTF-8. */
export function borshString(value: string): Uint8Array {
  return borshBytes(new TextEncoder().encode(value));
}

/**
 * `u64` nanoseconds from an RFC 3339 UTC timestamp, preserving up to 9 fractional digits.
 * `requireWholeSeconds` rejects a sub-second fraction when the consumer does (NEP-641).
 */
export function borshTimestampNanos(timestamp: string, requireWholeSeconds = false): bigint {
  const parts = /^(.*?)(?:\.(\d{1,9}))?Z$/.exec(timestamp);
  if (!parts) throw new Error("invalid_timestamp");
  const milliseconds = Date.parse(`${parts[1]}Z`);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("invalid_timestamp");
  if (requireWholeSeconds && milliseconds % 1000 !== 0) throw new Error("invalid_timestamp");
  return BigInt(milliseconds) * 1_000_000n + BigInt((parts[2] ?? "").padEnd(9, "0") || "0");
}
