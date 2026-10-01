/**
 * Provider evidence and pass-through records reach the wire camelCased. Signed protocol objects
 * (policies, owner messages, wallet requests) never pass through here: their field names are
 * part of what the owner signed.
 */

export function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

const maxDepth = 8;

export function camelize(value: unknown, depth = 0): unknown {
  if (depth > maxDepth) return value;
  if (Array.isArray(value)) return value.map((entry) => camelize(entry, depth + 1));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      camelKey(key),
      camelize(entry, depth + 1),
    ]),
  );
}

export function camelRecord(value: unknown): Record<string, unknown> {
  const result = camelize(value);
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {};
}
