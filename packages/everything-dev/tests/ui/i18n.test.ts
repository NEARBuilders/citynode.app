import { describe, expect, it } from "vitest";
import {
  matchLocale,
  readLocaleCookie,
  resolveLocale,
  serializeLocaleCookie,
} from "../../src/ui/i18n";

const locales = ["en", "es", "fr", "zh"] as const;

function resolve(overrides: Partial<Parameters<typeof resolveLocale>[0]> = {}) {
  return resolveLocale({
    preferredLocale: undefined,
    cookie: "",
    browserLocales: [],
    locales,
    defaultLocale: "en",
    cookieName: "citynode_locale",
    ...overrides,
  });
}

describe("shared locale resolution", () => {
  it("uses account preference before cookie and browser language", () => {
    expect(
      resolve({
        preferredLocale: "zh-CN",
        cookie: "citynode_locale=fr",
        browserLocales: ["es-MX"],
      }),
    ).toBe("zh");
  });

  it("uses a persisted locale before browser language", () => {
    expect(resolve({ cookie: "theme=dark; citynode_locale=fr", browserLocales: ["es-MX"] })).toBe(
      "fr",
    );
  });

  it("matches the first supported browser language", () => {
    expect(resolve({ browserLocales: ["de-DE", "es-MX", "fr-FR"] })).toBe("es");
  });

  it("falls back to English for unsupported or malformed preferences", () => {
    expect(resolve({ cookie: "citynode_locale=invalid", browserLocales: ["de-DE"] })).toBe("en");
    expect(resolve({ cookie: "citynode_locale=%E0%A4%A", browserLocales: [] })).toBe("en");
  });
});

describe("shared locale persistence", () => {
  it("matches regional locale tags and ignores unsupported values", () => {
    expect(matchLocale("fr-CA", locales)).toBe("fr");
    expect(matchLocale("de-DE", locales)).toBeUndefined();
  });

  it("reads and serializes the locale cookie", () => {
    expect(readLocaleCookie("theme=dark; citynode_locale=zh", "citynode_locale")).toBe("zh");
    expect(serializeLocaleCookie("citynode_locale", "es", false)).toBe(
      "citynode_locale=es; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    expect(serializeLocaleCookie("citynode_locale", "es", true)).toContain("; Secure");
  });
});
