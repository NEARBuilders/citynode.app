import type { AppMessageId, AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
export const geoNodeKinds = ["country", "state", "city"] as const;

const GEO_KIND_LABELS: Record<string, AppMessageId> = {
  country: "common.country",
  state: "common.state",
  city: "common.city",
  node: "label.node",
  thing: "label.thing",
};

export function nodeKindLabel(
  kind: string | null | undefined,
  fallback: string | undefined = undefined,
  t: AppTranslator = translateEnglishAppMessage,
): string {
  if (!kind) return fallback ?? t("nav.community");
  return GEO_KIND_LABELS[kind] ? t(GEO_KIND_LABELS[kind]) : kind;
}
