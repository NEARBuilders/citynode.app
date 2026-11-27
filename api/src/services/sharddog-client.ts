import { z } from "zod";

export interface ShardDogAward {
  viewUrl: string;
}

export interface ShardDogClaimLink {
  claimUrl: string;
}

export interface ShardDogDropDetails {
  name: string | null;
  imageUrl: string | null;
}

export interface ShardDogClient {
  readonly mode: "live" | "stub";
  dropUrl(dropId: string): string;
  describeDrop(dropId: string): Promise<ShardDogDropDetails | null>;
  award(input: {
    dropId: string;
    accountId: string;
    idempotencyKey: string;
  }): Promise<ShardDogAward>;
  createClaimLink(input: { dropId: string; idempotencyKey: string }): Promise<ShardDogClaimLink>;
}

export interface ShardDogClientConfig {
  apiKey: string;
  apiUrl: string;
  fetch?: typeof globalThis.fetch;
}

const AwardResponse = z.object({ viewUrl: z.url({ protocol: /^https$/ }) });
const ClaimLinkResponse = z.object({ claimUrl: z.url({ protocol: /^https$/ }) });
const DropResponse = z.object({
  name: z.string().trim().min(1).max(200).nullish().catch(null),
  imageUrl: z
    .url({ protocol: /^https$/ })
    .nullish()
    .catch(null),
});

export function createStubShardDogClient(apiUrl: string): ShardDogClient {
  const base = apiUrl.replace(/\/+$/, "");
  return {
    mode: "stub",
    dropUrl: (dropId) => `${base}/stub/drops/${encodeURIComponent(dropId)}`,
    describeDrop: async () => null,
    award: async ({ dropId, accountId }) => ({
      viewUrl: `${base}/stub/drops/${encodeURIComponent(dropId)}/${encodeURIComponent(accountId)}`,
    }),
    createClaimLink: async ({ dropId, idempotencyKey }) => ({
      claimUrl: `${base}/stub/claim/${encodeURIComponent(dropId)}/${encodeURIComponent(idempotencyKey)}`,
    }),
  };
}

export function createShardDogClient(config: ShardDogClientConfig): ShardDogClient {
  const apiKey = config.apiKey.trim();
  if (!apiKey) return createStubShardDogClient(config.apiUrl);
  const base = config.apiUrl.replace(/\/+$/, "");
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const post = async <T>(
    path: string,
    idempotencyKey: string,
    body: Record<string, string>,
    schema: z.ZodType<T>,
  ): Promise<T> => {
    const response = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`ShardDog responded ${response.status}`);
    return schema.parse(await response.json());
  };
  // TODO(#602): align paths and payloads with ShardDog's API docs once they arrive.
  return {
    mode: "live",
    dropUrl: (dropId) => `${base}/drops/${encodeURIComponent(dropId)}`,
    describeDrop: async (dropId) => {
      const response = await fetchImpl(`${base}/api/drops/${encodeURIComponent(dropId)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`ShardDog responded ${response.status}`);
      const drop = DropResponse.parse(await response.json());
      return { name: drop.name ?? null, imageUrl: drop.imageUrl ?? null };
    },
    award: ({ dropId, accountId, idempotencyKey }) =>
      post(
        `/api/drops/${encodeURIComponent(dropId)}/award`,
        idempotencyKey,
        { accountId },
        AwardResponse,
      ),
    createClaimLink: ({ dropId, idempotencyKey }) =>
      post(
        `/api/drops/${encodeURIComponent(dropId)}/claim-links`,
        idempotencyKey,
        {},
        ClaimLinkResponse,
      ),
  };
}
