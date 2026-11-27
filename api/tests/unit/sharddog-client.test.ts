import { describe, expect, it, vi } from "vitest";
import { createShardDogClient } from "@/services/sharddog-client";

describe("ShardDog client", () => {
  it("is a stub that never calls out when no API key is configured", async () => {
    const fetch = vi.fn();
    const client = createShardDogClient({ apiKey: " ", apiUrl: "https://shard.dog/", fetch });

    expect(client.mode).toBe("stub");
    const award = await client.award({
      dropId: "drop-1",
      accountId: "ada.near",
      idempotencyKey: "award-1",
    });
    expect(award.viewUrl).toMatch(/^https:\/\/shard\.dog\/stub\//);
    const link = await client.createClaimLink({ dropId: "drop-1", idempotencyKey: "claim-1" });
    expect(link.claimUrl).toMatch(/^https:\/\/shard\.dog\/stub\//);
    expect(client.dropUrl("drop 1")).toBe("https://shard.dog/stub/drops/drop%201");
    expect(await client.describeDrop("drop-1")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("awards through the API with the key and an idempotency key when one is configured", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ viewUrl: "https://shard.dog/view/1" })),
    );
    const client = createShardDogClient({ apiKey: "key-1", apiUrl: "https://shard.dog", fetch });

    expect(client.mode).toBe("live");
    expect(
      await client.award({ dropId: "drop-1", accountId: "ada.near", idempotencyKey: "award-1" }),
    ).toEqual({ viewUrl: "https://shard.dog/view/1" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://shard.dog/api/drops/drop-1/award");
    expect(init.headers).toMatchObject({
      authorization: "Bearer key-1",
      "idempotency-key": "award-1",
    });
    expect(JSON.parse(String(init.body))).toEqual({ accountId: "ada.near" });
  });

  it("fails on an error status or a response without an https link", async () => {
    const failing = createShardDogClient({
      apiKey: "key-1",
      apiUrl: "https://shard.dog",
      fetch: async () => new Response("down", { status: 503 }),
    });
    await expect(
      failing.award({ dropId: "d", accountId: "ada.near", idempotencyKey: "k" }),
    ).rejects.toThrow("503");

    const malformed = createShardDogClient({
      apiKey: "key-1",
      apiUrl: "https://shard.dog",
      fetch: async () => new Response(JSON.stringify({ claimUrl: "javascript:alert(1)" })),
    });
    await expect(malformed.createClaimLink({ dropId: "d", idempotencyKey: "k" })).rejects.toThrow();
  });

  it("reads a drop's name and image with the key, and nothing for an unknown drop", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/missing")
        ? new Response("not found", { status: 404 })
        : new Response(JSON.stringify({ name: "Pup", imageUrl: "https://cdn.shard.dog/pup.png" })),
    );
    const client = createShardDogClient({ apiKey: "key-1", apiUrl: "https://shard.dog/", fetch });

    expect(client.dropUrl("drop-1")).toBe("https://shard.dog/drops/drop-1");
    expect(await client.describeDrop("drop-1")).toEqual({
      name: "Pup",
      imageUrl: "https://cdn.shard.dog/pup.png",
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://shard.dog/api/drops/drop-1");
    expect(init.headers).toMatchObject({ authorization: "Bearer key-1" });
    expect(await client.describeDrop("missing")).toBeNull();
  });

  it("drops an image that isn't an https link and fails on an error status", async () => {
    const unsafe = createShardDogClient({
      apiKey: "key-1",
      apiUrl: "https://shard.dog",
      fetch: async () => new Response(JSON.stringify({ imageUrl: "javascript:alert(1)" })),
    });
    await expect(unsafe.describeDrop("d")).rejects.toThrow();

    const failing = createShardDogClient({
      apiKey: "key-1",
      apiUrl: "https://shard.dog",
      fetch: async () => new Response("down", { status: 503 }),
    });
    await expect(failing.describeDrop("d")).rejects.toThrow("503");
  });
});
