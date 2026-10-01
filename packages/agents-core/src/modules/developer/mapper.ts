import type { ApiKeyListRow } from "./repository.js";

export function toApiKeyDto(row: ApiKeyListRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
