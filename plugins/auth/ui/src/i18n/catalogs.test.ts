import { setupI18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { getLoginMessages, LOGIN_LOCALES, loginCatalogs } from "./catalogs";

describe("auth catalogs", () => {
  it("preserves keys, ICU values, and rich components across all four languages", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{([A-Za-z]\w*)\s*(?=[},])/g)].map((match) => match[1]).sort();
    const tags = (text: string) =>
      [...text.matchAll(/<\/?([A-Za-z]\w*)\s*\/?\s*>/g)].map((match) => match[1]).sort();
    for (const locale of LOGIN_LOCALES) {
      expect(Object.keys(loginCatalogs[locale]).sort()).toEqual(
        Object.keys(loginCatalogs.en).sort(),
      );
      const i18n = setupI18n({ locale, messages: { [locale]: getLoginMessages(locale) } });
      i18n.setMessagesCompiler(() => {
        throw new Error("Uncompiled auth message");
      });
      for (const id of Object.keys(loginCatalogs.en) as (keyof typeof loginCatalogs.en)[]) {
        expect(placeholders(loginCatalogs[locale][id]), `${locale}:${id}`).toEqual(
          placeholders(loginCatalogs.en[id]),
        );
        expect(tags(loginCatalogs[locale][id]), `${locale}:${id}:tags`).toEqual(
          tags(loginCatalogs.en[id]),
        );
        const values = Object.fromEntries(
          placeholders(loginCatalogs.en[id]).map((name) => [
            name,
            /count|number|days|amount/i.test(name) ? 2 : "Example",
          ]),
        );
        expect(i18n._(id, values), `${locale}:${id}`).not.toBe(id);
      }
    }
  });
});
