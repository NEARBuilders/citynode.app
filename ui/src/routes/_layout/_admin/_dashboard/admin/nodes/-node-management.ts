import type { QueryClient } from "@tanstack/react-query";

export function parseNodeMetadata(raw: string, description: string): Record<string, unknown> {
  let metadata: unknown;
  try {
    metadata = JSON.parse(raw);
  } catch {
    throw new Error("Metadata must be valid JSON.");
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Metadata must be a JSON object.");
  }
  const result: Record<string, unknown> = { ...metadata };
  if (description.trim()) result.description = description.trim();
  else delete result.description;
  return result;
}

export async function refreshNodeQueries(queryClient: QueryClient) {
  await Promise.all(
    ["admin-node", "admin-nodes", "root-nodes", "node", "staking-validators"].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}
