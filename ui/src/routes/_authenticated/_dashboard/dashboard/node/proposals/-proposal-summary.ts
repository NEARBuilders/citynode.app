import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
export type ReviewStatus = "pending" | "approved" | "rejected" | "removed";
export type ApplyStatus = "not_started" | "applying" | "applied" | "failed";

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

export function reviewStatusBadge(
  status: ReviewStatus,
  t: AppTranslator = translateEnglishAppMessage,
) {
  if (status === "pending")
    return { label: t("dashboard.awaitingReview"), variant: "warning" as const };
  if (status === "approved") return { label: t("dashboard.approved"), variant: "success" as const };
  if (status === "rejected")
    return { label: t("dashboard.rejected"), variant: "destructive" as const };
  return { label: t("dashboard.removed"), variant: "outline" as const };
}

export function applyStatusLabel(
  status: ApplyStatus,
  t: AppTranslator = translateEnglishAppMessage,
): string | null {
  if (status === "applying") return t("label.applying");
  if (status === "applied") return t("tenant.live");
  if (status === "failed") return t("label.applyFailed");
  return null;
}

export function sortProposals<T extends { reviewStatus: ReviewStatus; createdAt: string }>(
  proposals: readonly T[],
): T[] {
  return [...proposals].sort((a, b) => {
    const pending = Number(b.reviewStatus === "pending") - Number(a.reviewStatus === "pending");
    return pending || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
