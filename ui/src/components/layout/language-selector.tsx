import { CaretDownIcon, TranslateIcon } from "@phosphor-icons/react";
import { APP_LOCALE_LABELS, APP_LOCALES, type AppLocale } from "@/i18n/catalogs";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";

export function LanguageSelector() {
  const { locale, selectLocale } = useAppLocale();
  const t = useAppTranslation();

  return (
    <label className="relative inline-flex h-9 items-center gap-2 rounded-full border border-border bg-muted/50 pl-3 pr-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <TranslateIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("footer.language")}</span>
      <select
        aria-label={t("footer.language")}
        className="min-w-20 cursor-pointer appearance-none bg-transparent pr-5 outline-none"
        data-testid="public-footer-language"
        value={locale}
        onChange={(event) => selectLocale(event.target.value as AppLocale)}
      >
        {APP_LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {APP_LOCALE_LABELS[option]}
          </option>
        ))}
      </select>
      <CaretDownIcon
        className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}
