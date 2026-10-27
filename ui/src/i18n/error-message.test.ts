import { describe, expect, it } from "vitest";
import { APP_LOCALES, type AppTranslator } from "./catalogs";
import {
  AppActionError,
  appErrorMessage,
  isPermissionError,
  isSessionError,
  isWalletCancelled,
} from "./error-message";
import { translateAppMessage } from "./runtime";

describe("localized action failures", () => {
  it("keeps recovery instructions translatable after a language change", () => {
    const failure = new AppActionError("wallet.daoWrongAccount", {
      actual: "other.near",
      expected: "team.sputnik.near",
    });
    const messages = APP_LOCALES.map((locale) => {
      const t: AppTranslator = (id, values) => translateAppMessage(id, values, locale);
      const message = appErrorMessage(failure, t);
      expect(message).toContain("other.near");
      expect(message).toContain("team.sputnik.near");
      expect(message).not.toMatch(/\{(?:actual|expected)\}/);
      return message;
    });
    expect(new Set(messages).size).toBe(APP_LOCALES.length);
  });

  it("hides internal details while preserving permission and wallet recovery messages", () => {
    for (const locale of APP_LOCALES) {
      const t: AppTranslator = (id, values) => translateAppMessage(id, values, locale);
      expect(appErrorMessage(new Error("private database credentials and SQL details"), t)).toBe(
        t("error.action"),
      );
      expect(appErrorMessage({ code: "UNAUTHORIZED", message: "session internals" }, t)).toBe(
        t("error.session"),
      );
      expect(appErrorMessage({ status: 403 }, t)).toBe(t("error.permission"));
      expect(appErrorMessage({ status: 409 }, t)).toBe(t("error.conflict"));
      expect(appErrorMessage({ code: "ACTION_REJECTED" }, t)).toBe(t("wallet.cancelled"));
      expect(
        appErrorMessage(
          { code: "SERVICE_UNAVAILABLE", status: 503, data: { reason: "NEAR_RPC_UNAVAILABLE" } },
          t,
        ),
      ).toBe(t("error.nearUnavailable"));
      expect(appErrorMessage({ code: "SERVICE_UNAVAILABLE", status: 503 }, t)).toBe(
        t("error.action"),
      );
    }
  });

  it("tells expired sessions, denied access and other failures apart", () => {
    expect(isSessionError({ code: "UNAUTHORIZED" })).toBe(true);
    expect(isSessionError({ status: 401 })).toBe(true);
    expect(isPermissionError({ code: "FORBIDDEN" })).toBe(true);
    expect(isPermissionError({ status: 403 })).toBe(true);
    expect(isSessionError({ status: 403 })).toBe(false);
    expect(isPermissionError({ status: 401 })).toBe(false);
    for (const failure of [
      { status: 500, code: "INTERNAL_SERVER_ERROR" },
      { code: "BAD_REQUEST", status: 400 },
      new TypeError("Failed to fetch"),
      null,
    ]) {
      expect(isSessionError(failure)).toBe(false);
      expect(isPermissionError(failure)).toBe(false);
    }
  });

  it("recognises wallet cancellations from NEAR Connect wallets", () => {
    expect(isWalletCancelled(new Error("Wallet closed"))).toBe(true);
    expect(isWalletCancelled(new Error("User rejected the request"))).toBe(true);
    expect(isWalletCancelled(Object.assign(new Error("x"), { code: "ACTION_REJECTED" }))).toBe(
      true,
    );
    expect(isWalletCancelled(new Error("Smart contract panicked"))).toBe(false);
  });

  it("explains a rejected or unverifiable staking pool instead of a generic failure", () => {
    const t = ((id: string) => id) as AppTranslator;
    expect(
      appErrorMessage(
        {
          code: "BAD_REQUEST",
          data: {
            invalidFields: ["accountId"],
            validationErrors: [
              { field: "accountId", message: "x", code: "STAKING_POOL_NOT_APPROVED" },
            ],
          },
        },
        t,
      ),
    ).toBe("tenant.notApprovedPool");
    expect(
      appErrorMessage(
        { code: "CONNECTION_ERROR", data: { errorCode: "STAKING_POOL_CHECK_FAILED" } },
        t,
      ),
    ).toBe("stake.poolCheckFailed");
    expect(
      appErrorMessage({ code: "BAD_REQUEST", data: { invalidFields: ["accountId"] } }, t),
    ).toBe("error.action");
  });
});
