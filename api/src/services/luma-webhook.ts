import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const LUMA_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const coordinateSchema = z.object({ latitude: z.number(), longitude: z.number() });

export const lumaAddressSchema = z
  .object({
    full_address: z.string().nullish(),
    city_state: z.string().nullish(),
    city: z.string().nullish(),
    region: z.string().nullish(),
    country: z.string().nullish(),
  })
  .nullish();

export const lumaEventLocationShape = {
  coordinate: coordinateSchema.nullish(),
  geo_address_json: lumaAddressSchema,
};

const eventRef = z.object({ id: z.string().min(1).max(200) }).loose();

export const lumaWebhookSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["event.created", "event.updated"]), data: eventRef }),
  z.object({ type: z.literal("event.canceled"), data: eventRef }),
  z.object({
    type: z.literal("calendar.event.added"),
    data: z.object({ id: z.string().min(1).max(200), platform: z.string() }).loose(),
  }),
]);
export type LumaWebhook = z.infer<typeof lumaWebhookSchema>;

function signatureParts(header: string) {
  const parts = new Map<string, string[]>();
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    parts.set(key, [...(parts.get(key) ?? []), part.slice(index + 1).trim()]);
  }
  return parts;
}

export function verifyLumaWebhook(input: {
  secrets: string[];
  signatureHeader: string | null;
  rawBody: string;
  nowSeconds: number;
}): boolean {
  if (!input.signatureHeader || input.secrets.length === 0) return false;
  const parts = signatureParts(input.signatureHeader);
  const timestamp = parts.get("t")?.[0];
  const signatures = parts.get("v1") ?? [];
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(input.nowSeconds - Number(timestamp)) > LUMA_WEBHOOK_TOLERANCE_SECONDS) return false;
  return input.secrets.some((secret) => {
    const expected = Buffer.from(
      createHmac("sha256", secret).update(`${timestamp}.${input.rawBody}`).digest("hex"),
    );
    return signatures.some((signature) => {
      const received = Buffer.from(signature);
      return received.length === expected.length && timingSafeEqual(received, expected);
    });
  });
}
