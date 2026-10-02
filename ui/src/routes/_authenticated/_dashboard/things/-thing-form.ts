import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
export const DEFAULT_THING_PAYLOAD = '{\n  "kind": "demo",\n  "value": "hello"\n}';

export type PayloadParse = { ok: true; value: unknown } | { ok: false; error: string };

export function parseThingPayload(
  raw: string,
  t: AppTranslator = translateEnglishAppMessage,
): PayloadParse {
  if (!raw.trim()) return { ok: false, error: t("things.payloadRequired") };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: t("things.invalidJson") };
  }
}

export function formatThingPayload(raw: string): string {
  const parsed = parseThingPayload(raw);
  return parsed.ok ? JSON.stringify(parsed.value, null, 2) : raw;
}

export function isSignInError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return code === "UNAUTHORIZED" || status === 401;
}
