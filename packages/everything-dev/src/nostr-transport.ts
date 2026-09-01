import { Buffer } from "node:buffer";
import { Data, Effect } from "effect";
import { finalizeEvent, type Event, type EventTemplate } from "nostr-tools/pure";
import { decode as decodeNip19 } from "nostr-tools/nip19";

export const NOSTR_PAYLOAD_LIMIT = 48_000;
export const REGISTRY_EVENT_KIND = 30078;

export class NostrKeyMissing extends Data.TaggedError("NostrKeyMissing")<{
  message: string;
}> {}

export class PayloadTooLarge extends Data.TaggedError("PayloadTooLarge")<{
  size: number;
  limit: number;
}> {}

export class RelayRejected extends Data.TaggedError("RelayRejected")<{
  status: number;
  detail: string;
}> {}

export interface PublishEventInput {
  key: string;
  account: string;
  gateway: string;
  registry: string;
  value: string;
  secretKey?: string;
}

export interface RelayResult {
  transactionHash?: string;
}

export interface PublishViaNostrResult extends RelayResult {
  event: Event;
}

function decodeSecretKey(raw: string): Uint8Array | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("nsec")) {
    try {
      const decoded = decodeNip19(trimmed);
      return decoded.type === "nsec" ? decoded.data : null;
    } catch {
      return null;
    }
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return new Uint8Array(Buffer.from(trimmed, "hex"));
  }
  return null;
}

export function readNostrSecretKey(
  explicit?: string,
): Effect.Effect<Uint8Array, NostrKeyMissing> {
  return Effect.gen(function* () {
    const raw = explicit ?? process.env.NOSTR_PRIVATE_KEY ?? process.env.BOS_NOSTR_PRIVATE_KEY;
    if (!raw) {
      return yield* Effect.fail(
        new NostrKeyMissing({
          message:
            "No nostr signing key available. Generate a deployment key at /settings/deployment-keys and set NOSTR_PRIVATE_KEY (nsec or hex).",
        }),
      );
    }
    const decoded = decodeSecretKey(raw);
    if (!decoded) {
      return yield* Effect.fail(
        new NostrKeyMissing({
          message: "Invalid nostr signing key format — expected nsec1… or a 64-char hex key.",
        }),
      );
    }
    return decoded;
  });
}

export function signPublishEvent(
  input: PublishEventInput,
): Effect.Effect<Event, NostrKeyMissing | PayloadTooLarge> {
  const size = Buffer.byteLength(input.value, "utf-8");
  if (size > NOSTR_PAYLOAD_LIMIT) {
    return Effect.fail(new PayloadTooLarge({ size, limit: NOSTR_PAYLOAD_LIMIT }));
  }

  return Effect.gen(function* () {
    const secretKey = yield* readNostrSecretKey(input.secretKey);
    const template: EventTemplate = {
      kind: REGISTRY_EVENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", input.key],
        ["account", input.account],
        ["gateway", input.gateway],
        ["registry", input.registry],
        ["alt", `bos.config.json publish for ${input.account}/${input.gateway}`],
      ],
      content: input.value,
    };
    return finalizeEvent(template, secretKey);
  });
}

function extractTransactionHash(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const direct = payload as { transactionHash?: unknown; data?: { transactionHash?: unknown } };
  if (typeof direct.transactionHash === "string") return direct.transactionHash;
  if (typeof direct.data?.transactionHash === "string") return direct.data.transactionHash;
  return undefined;
}

export function relayViaNostr(
  event: Event,
  hostUrl: string,
): Effect.Effect<RelayResult, RelayRejected> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        `${hostUrl.replace(/\/$/, "")}/api/rpc/apps/nostrRelayKvWrite`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event }),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        throw new RelayRejected({
          status: response.status,
          detail: text.slice(0, 500) || response.statusText,
        });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      return { transactionHash: extractTransactionHash(parsed) };
    },
    catch: (error) =>
      error instanceof RelayRejected
        ? error
        : new RelayRejected({
            status: 0,
            detail: error instanceof Error ? error.message : String(error),
          }),
  });
}

export function publishViaNostr(
  input: PublishEventInput & { hostUrl: string },
): Effect.Effect<PublishViaNostrResult, NostrKeyMissing | PayloadTooLarge | RelayRejected> {
  return Effect.gen(function* () {
    const event = yield* signPublishEvent(input);
    const { transactionHash } = yield* relayViaNostr(event, input.hostUrl);
    return { event, transactionHash };
  });
}
