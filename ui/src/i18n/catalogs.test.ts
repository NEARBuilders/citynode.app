import { setupI18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import {
  APP_LOCALE_LABELS,
  APP_LOCALES,
  appCatalogs,
  appFeatureCatalogs,
  englishAppMessages,
  getAppMessages,
} from "./catalogs";

describe("app message catalogs", () => {
  it("uses singular and plural organization and passkey counts on the dashboard", () => {
    const en = setupI18n({ locale: "en", messages: { en: getAppMessages("en") } });
    const es = setupI18n({ locale: "es", messages: { es: getAppMessages("es") } });
    const fr = setupI18n({ locale: "fr", messages: { fr: getAppMessages("fr") } });
    expect(en._("dashboard.orgCount", { count: 1 })).toBe(
      "You belong to 1 organization. Pick one to work in.",
    );
    expect(en._("dashboard.orgCount", { count: 2 })).toBe(
      "You belong to 2 organizations. Pick one to work in.",
    );
    expect(es._("dashboard.orgCount", { count: 1 })).toBe(
      "Perteneces a 1 organización. Elige una para trabajar.",
    );
    expect(es._("dashboard.orgCount", { count: 2 })).toBe(
      "Perteneces a 2 organizaciones. Elige una para trabajar.",
    );
    expect(fr._("dashboard.orgCount", { count: 1 })).toBe(
      "Vous faites partie de 1 organisation. Choisissez-en une pour travailler.",
    );
    expect(fr._("dashboard.orgCount", { count: 2 })).toBe(
      "Vous faites partie de 2 organisations. Choisissez-en une pour travailler.",
    );
    expect(es._("dashboard.passkeysAdded", { count: 1 })).toBe("1 añadida");
    expect(es._("dashboard.passkeysAdded", { count: 2 })).toBe("2 añadidas");
    expect(fr._("dashboard.passkeysAdded", { count: 1 })).toBe("1 ajoutée");
    expect(fr._("dashboard.passkeysAdded", { count: 2 })).toBe("2 ajoutées");
  });
  it("uses singular table summaries for one row and plural summaries for several", () => {
    const en = setupI18n({ locale: "en", messages: { en: getAppMessages("en") } });
    const fr = setupI18n({ locale: "fr", messages: { fr: getAppMessages("fr") } });
    expect(en._("table.rows", { shown: 1, total: 1 })).toBe("Showing 1 of 1 row.");
    expect(fr._("table.rows", { shown: 1, total: 1 })).toBe("1 ligne affichée sur 1.");
    expect(fr._("table.rows", { shown: 2, total: 2 })).toBe("2 lignes affichées sur 2.");
  });
  it("keeps feature message keys unique so interpolation cannot be overwritten", () => {
    const ids = appFeatureCatalogs.flatMap((catalog) => Object.keys(catalog.en));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("provides every app message in each supported locale", () => {
    for (const locale of APP_LOCALES) {
      expect(Object.keys(appCatalogs[locale]).sort()).toEqual(
        Object.keys(englishAppMessages).sort(),
      );
    }
  });

  it("loads translated landing headings", () => {
    expect(appCatalogs.es["landing.title"]).toBe("Tu ciudad, en la red.");
    expect(appCatalogs.fr["landing.title"]).toBe("Votre ville, sur le réseau.");
    expect(appCatalogs.zh["landing.title"]).toBe("让你的城市加入网络。");
  });

  it("provides a native label for every language option", () => {
    expect(Object.keys(APP_LOCALE_LABELS)).toEqual(APP_LOCALES);
    expect(APP_LOCALE_LABELS).toEqual({
      en: "English",
      es: "Español",
      fr: "Français",
      zh: "中文",
    });
  });

  it("interpolates translated public-flow values", () => {
    for (const locale of APP_LOCALES) {
      const i18n = setupI18n({ locale, messages: { [locale]: getAppMessages(locale) } });
      i18n.setMessagesCompiler(() => {
        throw new Error("Uncompiled catalog");
      });
      expect(i18n._("apply.slug.available", { hostname: "city.example" })).toContain(
        "city.example",
      );
      expect(i18n._("explore.results.many", { count: 3 })).toContain("3");
      expect(i18n._("explore.results.many", { count: 3 })).not.toContain("{count}");
    }
  });

  it("preserves the placeholders in every raw translation", () => {
    const placeholders = (message: string) =>
      [...message.matchAll(/\{([A-Za-z][\w]*)\s*(?=[},])/g)].map((match) => match[1]).sort();
    for (const locale of APP_LOCALES) {
      for (const id of Object.keys(englishAppMessages) as (keyof typeof englishAppMessages)[]) {
        expect(placeholders(appCatalogs[locale][id]), `${locale}:${id}`).toEqual(
          placeholders(englishAppMessages[id]),
        );
        const tags = (message: string) =>
          [...message.matchAll(/<\/?([A-Za-z][\w]*)\s*\/?\s*>/g)].map((match) => match[1]).sort();
        expect(tags(appCatalogs[locale][id]), `${locale}:${id}:tags`).toEqual(
          tags(englishAppMessages[id]),
        );
      }
    }
  });
  it("compiles every catalog and handles plural messages without a runtime compiler", () => {
    for (const locale of APP_LOCALES) {
      const messages = getAppMessages(locale);
      const i18n = setupI18n({ locale, messages: { [locale]: messages } });
      i18n.setMessagesCompiler(() => {
        throw new Error("Uncompiled message");
      });
      for (const id of Object.keys(englishAppMessages) as (keyof typeof englishAppMessages)[]) {
        const values = Object.fromEntries(
          [...englishAppMessages[id].matchAll(/\{([A-Za-z][\w]*)\s*(?=[},])/g)].map((match) => [
            match[1],
            /count|approved|required|total|number|amount|days|hours/i.test(match[1])
              ? 2
              : "Example",
          ]),
        );
        expect(i18n._(id, values), `${locale}:${id}`).not.toBe(id);
      }
      for (const count of [0, 1, 2]) {
        expect(i18n._("nodeConfig.changes", { count })).not.toContain("{count");
        expect(i18n._("nodeConfig.changes", { count })).toContain(String(count));
      }
    }
  });
});
