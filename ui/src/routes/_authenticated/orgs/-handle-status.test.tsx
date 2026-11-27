// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppI18nProvider } from "@/i18n/runtime";
import { type HandleStatus, HandleStatusAddon } from "./-handle-status";

afterEach(cleanup);

function renderIn(locale: "en" | "es", status: HandleStatus) {
  return render(
    <AppI18nProvider initialLocale={locale} preferredLocale={locale}>
      <HandleStatusAddon status={status} />
    </AppI18nProvider>,
  );
}

describe("handle status", () => {
  it.each([
    ["en", "taken"],
    ["es", "ocupado"],
  ] as const)("says a handle is taken in %s", (locale, label) => {
    renderIn(locale, "taken");
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it.each([
    ["en", "available"],
    ["es", "disponible"],
  ] as const)("says a handle is available in %s", (locale, label) => {
    renderIn(locale, "available");
    expect(screen.getByLabelText(label)).toBeTruthy();
  });
});
