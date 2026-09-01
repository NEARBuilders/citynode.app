import { Buffer } from "node:buffer";
import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicKey } from "nostr-tools/pure";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal("fetch", fetchMock);

import {
  NostrKeyMissing,
  PayloadTooLarge,
  RelayRejected,
  publishViaNostr,
  relayViaNostr,
  signPublishEvent,
} from "../../src/nostr-transport";

async function expectErrorTag(
  effect: Effect.Effect<unknown, { _tag: string }>,
  tag: string,
): Promise<void> {
  const exit = await Effect.runPromiseExit(effect);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = exit.cause as { readonly _tag: string; readonly error?: { _tag: string } };
    expect(failure.error?._tag ?? failure._tag).toBe(tag);
  }
}

const SECRET_HEX = "f6200c19d5b5505d4de5c3f5a4fff8916a44b9b34042e6703886bf1fa79c4432";
const SECRET_PUBKEY = "43c2db33b878e467bf5d74294ddf3edd06d00741fa1a8fb4e6566db0a8053a5d";
const NSEC = "nsec17csqcxw4k4g96n09c066fllcj94yfwdngppwvupcs6l3lfuugseqjzddn0";

const baseInput = {
  key: "apps/v1.citynode.near/citynode.app/bos.config.json",
  account: "v1.citynode.near",
  gateway: "citynode.app",
  registry: "dev.everything.near",
  value: '{"account":"v1.citynode.near"}',
  secretKey: SECRET_HEX,
};

const signedEvent = {
  id: "a".repeat(64),
  pubkey: SECRET_PUBKEY,
  created_at: 1_700_000_000,
  kind: 30078,
  tags: [["d", baseInput.key]],
  content: baseInput.value,
  sig: "b".repeat(128),
};

describe("signPublishEvent", () => {
  it("signs a NIP-78 kind-30078 event with the registry key as d tag", async () => {
    const event = await Effect.runPromise(signPublishEvent(baseInput));

    expect(event.kind).toBe(30078);
    expect(event.pubkey).toBe(SECRET_PUBKEY);
    expect(event.content).toBe(baseInput.value);
    expect(event.tags).toContainEqual(["d", baseInput.key]);
    expect(event.tags).toContainEqual(["account", baseInput.account]);
    expect(event.tags).toContainEqual(["gateway", baseInput.gateway]);
    expect(event.tags).toContainEqual(["registry", baseInput.registry]);
    expect(event.sig).toHaveLength(128);
    expect(event.id).toHaveLength(64);
  });

  it("accepts nsec-encoded keys", async () => {
    const event = await Effect.runPromise(
      signPublishEvent({ ...baseInput, secretKey: NSEC }),
    );

    expect(event.pubkey).toBe(SECRET_PUBKEY);
  });

  it("falls back to NOSTR_PRIVATE_KEY env when no key is provided", async () => {
    const original = process.env.NOSTR_PRIVATE_KEY;
    process.env.NOSTR_PRIVATE_KEY = SECRET_HEX;
    try {
      const event = await Effect.runPromise(
        signPublishEvent({ ...baseInput, secretKey: undefined }),
      );
      expect(event.pubkey).toBe(SECRET_PUBKEY);
    } finally {
      if (original === undefined) delete process.env.NOSTR_PRIVATE_KEY;
      else process.env.NOSTR_PRIVATE_KEY = original;
    }
  });

  it("fails with NostrKeyMissing when no key is available", async () => {
    const original = process.env.NOSTR_PRIVATE_KEY;
    const originalBos = process.env.BOS_NOSTR_PRIVATE_KEY;
    delete process.env.NOSTR_PRIVATE_KEY;
    delete process.env.BOS_NOSTR_PRIVATE_KEY;
    try {
      await expectErrorTag(
        signPublishEvent({ ...baseInput, secretKey: undefined }),
        "NostrKeyMissing",
      );
    } finally {
      if (original !== undefined) process.env.NOSTR_PRIVATE_KEY = original;
      if (originalBos !== undefined) process.env.BOS_NOSTR_PRIVATE_KEY = originalBos;
    }
  });

  it("rejects malformed keys", async () => {
    await expectErrorTag(
      signPublishEvent({ ...baseInput, secretKey: "not-a-key" }),
      "NostrKeyMissing",
    );
  });

  it("fails with PayloadTooLarge when the config value exceeds the cap", async () => {
    await expectErrorTag(
      signPublishEvent({ ...baseInput, value: "x".repeat(49_000) }),
      "PayloadTooLarge",
    );
  });
});

describe("relayViaNostr", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it("POSTs the signed event and returns the transaction hash", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ transactionHash: "ABC123" }), { status: 200 }),
    );

    const result = await Effect.runPromise(
      relayViaNostr(signedEvent, "https://citynode.app"),
    );

    expect(result.transactionHash).toBe("ABC123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://citynode.app/api/rpc/apps/nostrRelayKvWrite",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(vi.mocked(fetchMock).mock.calls[0]![1]!.body as string);
    expect(body.event.kind).toBe(30078);
  });

  it("unwraps oRPC data envelopes", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { transactionHash: "DEF456" } }), { status: 200 }),
    );

    const result = await Effect.runPromise(
      relayViaNostr(signedEvent, "https://citynode.app"),
    );

    expect(result.transactionHash).toBe("DEF456");
  });

  it("raises RelayRejected with status and detail on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "unbound key" }), { status: 403 }),
    );

    await expectErrorTag(relayViaNostr(signedEvent, "https://citynode.app"), "RelayRejected");
  });

  it("raises RelayRejected on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    await expectErrorTag(relayViaNostr(signedEvent, "https://citynode.app"), "RelayRejected");
  });
});

describe("publishViaNostr", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it("signs then relays in one program", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ transactionHash: "GHI789" }), { status: 200 }),
    );

    const result = await Effect.runPromise(
      publishViaNostr({ ...baseInput, hostUrl: "https://citynode.app" }),
    );

    expect(result.event.pubkey).toBe(
      getPublicKey(new Uint8Array(Buffer.from(SECRET_HEX, "hex"))),
    );
    expect(result.transactionHash).toBe("GHI789");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
