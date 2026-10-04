import { setupI18n } from "@lingui/core";
import { createLocaleRuntime, matchLocale } from "everything-dev/ui/i18n";
import type { ReactNode } from "react";
import {
  APP_LOCALE_COOKIE,
  APP_LOCALES,
  type AppLocale,
  type AppMessageId,
  type AppTranslator,
  DEFAULT_APP_LOCALE,
  getAppMessages,
} from "./catalogs";

const appRuntime = createLocaleRuntime({
  locales: APP_LOCALES,
  defaultLocale: DEFAULT_APP_LOCALE,
  cookieName: APP_LOCALE_COOKIE,
});

export function AppI18nProvider({
  children,
  preferredLocale,
  initialLocale,
  onLocaleChange,
}: {
  children: ReactNode;
  preferredLocale?: string | null;
  initialLocale?: string | null;
  onLocaleChange?: (locale: AppLocale) => Promise<void>;
}) {
  return (
    <appRuntime.LocaleProvider
      messages={getAppMessages}
      initialLocale={initialLocale}
      preferredLocale={preferredLocale}
      onLocaleChange={onLocaleChange}
    >
      {children}
    </appRuntime.LocaleProvider>
  );
}

export const useAppLocale = appRuntime.useLocale;
export const useAppTranslation = appRuntime.useTranslation<AppMessageId> as () => AppTranslator;

export function resolveAppLocale(preferredLocale?: string | null, initialLocale?: string | null) {
  return (
    matchLocale(preferredLocale, APP_LOCALES) ??
    matchLocale(initialLocale, APP_LOCALES) ??
    appRuntime.detectLocale()
  );
}

const translators = new Map<AppLocale, ReturnType<typeof setupI18n>>();

export function translateAppMessage(
  id: AppMessageId,
  values?: Record<string, string | number>,
  locale = appRuntime.getLocale(),
) {
  let translator = translators.get(locale);
  if (!translator) {
    translator = setupI18n({ locale, messages: { [locale]: getAppMessages(locale) } });
    translators.set(locale, translator);
  }
  return translator._(id, values);
}

export const translateEnglishAppMessage: AppTranslator = (id, values) =>
  translateAppMessage(id, values, "en");
