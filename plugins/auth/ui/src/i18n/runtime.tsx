import { setupI18n } from "@lingui/core";
import { I18nProvider, useLingui } from "@lingui/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOGIN_LOCALE,
  getLoginMessages,
  LOGIN_LOCALE_COOKIE,
  LOGIN_LOCALES,
  type LoginLocale,
  type LoginMessageId,
  type LoginMessageValues,
  type LoginTranslator,
} from "./catalogs";

type LoginLocaleContextValue = {
  locale: LoginLocale;
  selectLocale: (locale: LoginLocale) => void;
};

const LoginLocaleContext = createContext<LoginLocaleContextValue | null>(null);

export function isLoginLocale(value: string): value is LoginLocale {
  return (LOGIN_LOCALES as readonly string[]).includes(value);
}

export function readLoginLocaleCookie(cookie: string): LoginLocale | undefined {
  for (const part of cookie.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name !== LOGIN_LOCALE_COOKIE) continue;
    try {
      const value = decodeURIComponent(valueParts.join("="));
      return isLoginLocale(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function resolveLoginLocale(cookie: string, preferences: readonly string[]): LoginLocale {
  const selected = readLoginLocaleCookie(cookie);
  if (selected) return selected;

  for (const preference of preferences) {
    const normalized = preference.toLowerCase();
    const exact = LOGIN_LOCALES.find((locale) => locale.toLowerCase() === normalized);
    if (exact) return exact;
    const base = normalized.split("-")[0];
    const matchingBase = LOGIN_LOCALES.find((locale) => locale === base);
    if (matchingBase) return matchingBase;
  }

  return DEFAULT_LOGIN_LOCALE;
}

export function serializeLoginLocaleCookie(locale: LoginLocale, secure: boolean): string {
  return `${LOGIN_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function createLoginI18n(locale: LoginLocale) {
  return setupI18n({
    locale,
    messages: { [locale]: getLoginMessages(locale) },
  });
}

function detectLoginLocale(): LoginLocale {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    return DEFAULT_LOGIN_LOCALE;
  }
  return resolveLoginLocale(document.cookie, navigator.languages);
}

export function LoginI18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: LoginLocale;
}) {
  const [locale, setLocale] = useState<LoginLocale>(() => initialLocale ?? detectLoginLocale());
  const i18n = useMemo(() => createLoginI18n(locale), [locale]);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [locale]);

  const selectLocale = useCallback((nextLocale: LoginLocale) => {
    Reflect.set(
      document,
      "cookie",
      serializeLoginLocaleCookie(nextLocale, window.location.protocol === "https:"),
    );
    setLocale(nextLocale);
  }, []);

  const value = useMemo(() => ({ locale, selectLocale }), [locale, selectLocale]);

  return (
    <LoginLocaleContext.Provider value={value}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </LoginLocaleContext.Provider>
  );
}

export function useLoginLocale(): LoginLocaleContextValue {
  const value = useContext(LoginLocaleContext);
  if (!value) throw new Error("useLoginLocale must be used within LoginI18nProvider");
  return value;
}

export function useLoginTranslation(): LoginTranslator {
  const { _ } = useLingui();
  return useCallback((id: LoginMessageId, values?: LoginMessageValues) => _(id, values), [_]);
}
