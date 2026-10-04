import { describe, expect, it } from "vitest";
import type { AppTranslator } from "@/i18n/catalogs";
import { translateAppMessage } from "@/i18n/runtime";
import { formatPocLogValue, type PocLogMessage } from "./-poc-log-message";

describe("lifecycle log messages", () => {
  it("retranslates stored system messages while preserving account IDs and transaction hashes", () => {
    const entry: PocLogMessage = {
      messageId: "poc.teamLinked",
      values: { account: "team.sputnik.near" },
    };
    const t =
      (locale: "en" | "fr"): AppTranslator =>
      (id, values) =>
        translateAppMessage(id, values, locale);
    const english = formatPocLogValue(entry, t("en"));
    const french = formatPocLogValue(entry, t("fr"));
    expect(english).not.toBe(french);
    expect(french).toContain("team.sputnik.near");
    expect(formatPocLogValue("transaction-hash", t("fr"))).toBe("transaction-hash");
    expect(
      formatPocLogValue(
        { error: new Error("private RPC details"), account: "team.sputnik.near" },
        t("fr"),
      ),
    ).toBe(t("fr")("error.action"));
  });
});
