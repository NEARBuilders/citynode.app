import { describe, expect, it } from "vitest";
import { APP_LOCALES, type AppTranslator } from "./catalogs";
import {
  AppActionError,
  appErrorMessage,
  isPermissionError,
  isSessionError,
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
    }
  });

  it("tells members missing a team area to ask an owner for one", () => {
    const failure = {
      code: "FORBIDDEN",
      status: 403,
      message: "Ask an organization owner to add you to a team with node-operations.",
      data: { requiredPermissions: ["node-operations"] },
    };
    const messages = APP_LOCALES.map((locale) => {
      const t: AppTranslator = (id, values) => translateAppMessage(id, values, locale);
      const message = appErrorMessage(failure, t);
      expect(message).toBe(t("permissions.teamDenied", { area: t("feature.nodeOperations") }));
      expect(message).toContain(t("feature.nodeOperations"));
      expect(message).not.toMatch(/\{area\}/);
      return message;
    });
    expect(new Set(messages).size).toBe(APP_LOCALES.length);
  });

  it("keeps the generic permission message for unknown required permissions", () => {
    const t: AppTranslator = (id, values) => translateAppMessage(id, values, "en");
    expect(
      appErrorMessage({ status: 403, data: { requiredPermissions: ["proposals:create"] } }, t),
    ).toBe(t("error.permission"));
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
});
