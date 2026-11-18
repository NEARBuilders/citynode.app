import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyLumaWebhook } from "@/services/luma-webhook";

const secret = "whsec_fixture";
const body = JSON.stringify({ type: "event.created", data: { id: "evt-1" } });
const now = 1_800_000_000;

function sign(key: string, timestamp: number, raw: string) {
  return `t=${timestamp},v1=${createHmac("sha256", key).update(`${timestamp}.${raw}`).digest("hex")}`;
}

describe("verifyLumaWebhook", () => {
  it("accepts a signature over the timestamp and raw body", () => {
    expect(
      verifyLumaWebhook({
        secrets: [secret],
        signatureHeader: sign(secret, now, body),
        rawBody: body,
        nowSeconds: now + 30,
      }),
    ).toBe(true);
  });

  it("accepts any configured secret and any v1 signature in the header", () => {
    const header = `${sign("whsec_old", now, body)},v1=${"0".repeat(64)}`;
    expect(
      verifyLumaWebhook({
        secrets: ["whsec_other", "whsec_old"],
        signatureHeader: header,
        rawBody: body,
        nowSeconds: now,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body, wrong secret, stale timestamp or missing header", () => {
    const header = sign(secret, now, body);
    const base = { secrets: [secret], signatureHeader: header, rawBody: body, nowSeconds: now };
    expect(verifyLumaWebhook({ ...base, rawBody: `${body} ` })).toBe(false);
    expect(verifyLumaWebhook({ ...base, secrets: ["whsec_wrong"] })).toBe(false);
    expect(verifyLumaWebhook({ ...base, nowSeconds: now + 301 })).toBe(false);
    expect(verifyLumaWebhook({ ...base, signatureHeader: null })).toBe(false);
    expect(verifyLumaWebhook({ ...base, secrets: [] })).toBe(false);
    expect(verifyLumaWebhook({ ...base, signatureHeader: `v1=${header.split("v1=")[1]}` })).toBe(
      false,
    );
  });
});
