import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import type { ReviewStatus } from "@/lib/proposal-phase";

export function proposalTitle(
  payload: unknown,
  fallback: string,
  t: AppTranslator = translateEnglishAppMessage,
): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    for (const key of ["title", "name", "slug"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const keys = Object.keys(record);
    if (keys.length > 0) {
      const shown = keys.slice(0, 3).join(", ");
      return keys.length > 3
        ? t("proposal.changedFieldsMore", { fields: shown, count: keys.length - 3 })
        : t("proposal.changedFields", { fields: shown });
    }
  }
  return fallback;
}

export function sortProposals<T extends { reviewStatus: ReviewStatus; createdAt: string }>(
  proposals: readonly T[],
): T[] {
  return [...proposals].sort((a, b) => {
    const pending = Number(b.reviewStatus === "pending") - Number(a.reviewStatus === "pending");
    return pending || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
