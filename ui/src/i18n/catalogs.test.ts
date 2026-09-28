import { describe, expect, it } from "vitest";
import { APP_LOCALES, englishAppMessages, getAppMessages } from "./catalogs";

describe("app message catalogs", () => {
  it("provides every landing message in each supported locale", () => {
    for (const locale of APP_LOCALES) {
      const messages = getAppMessages(locale);
      for (const id of Object.keys(englishAppMessages)) {
        expect(messages[id], `${locale}:${id}`).toBeTruthy();
      }
    }
  });

  it("loads translated landing headings", () => {
    expect(getAppMessages("es")["landing.title"]).toBe("Tu ciudad, en la red.");
    expect(getAppMessages("fr")["landing.title"]).toBe("Votre ville, sur le réseau.");
    expect(getAppMessages("zh")["landing.title"]).toBe("让你的城市加入网络。");
  });
});
