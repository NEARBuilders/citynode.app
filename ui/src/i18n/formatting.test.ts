import { createTenantConfigDraftSchema, emptyTenantConfigDraft } from "everything-dev/ui/tenant";
import { describe, expect, it, vi } from "vitest";
import { formatLocalDate } from "@/components/local-date";
import { APP_LOCALES } from "./catalogs";
import { translateAppMessage } from "./runtime";

describe("localized values and validation", () => {
  it("uses the selected language and the existing local time zone for dates", () => {
    const date = new Date("2026-09-24T20:30:00Z");
    for (const locale of APP_LOCALES) {
      expect(formatLocalDate(date, "datetime", locale)).toBe(
        new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date),
      );
    }
    vi.spyOn(Date, "now").mockReturnValue(date.getTime() + 86400000);
    try {
      expect(formatLocalDate(date, "relative", "fr")).toBe("hier");
      expect(formatLocalDate(date, "relative", "es")).toBe("ayer");
      expect(formatLocalDate("invalid", "date", "zh")).toBe("");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("translates validation without changing URL and integrity pairing rules", () => {
    for (const locale of APP_LOCALES) {
      const t = (id: Parameters<typeof translateAppMessage>[0]) =>
        translateAppMessage(id, undefined, locale);
      const schema = createTenantConfigDraftSchema({
        url: t("nodeConfig.urlInvalid"),
        integrity: t("nodeConfig.integrityInvalid"),
        title: t("nodeConfig.titleRequired"),
        description: t("nodeConfig.descriptionRequired"),
        uiPair: t("nodeConfig.uiPairRequired"),
        ssrPair: t("nodeConfig.ssrPairRequired"),
      });
      const valid = { ...emptyTenantConfigDraft, title: "City", description: "Local community" };
      expect(schema.safeParse(valid).success).toBe(true);
      const invalid = schema.safeParse({
        ...valid,
        title: "",
        uiProduction: "https://cdn.example/ui",
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues.map((issue) => issue.message)).toContain(
          t("nodeConfig.titleRequired"),
        );
        expect(invalid.error.issues.map((issue) => issue.message)).toContain(
          t("nodeConfig.uiPairRequired"),
        );
      }
    }
  });
});
