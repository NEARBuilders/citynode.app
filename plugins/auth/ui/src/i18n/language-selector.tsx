import type { ComponentProps } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { LOGIN_LOCALE_LABELS, LOGIN_LOCALES, type LoginLocale } from "./catalogs";
import { useLoginLocale, useLoginTranslation } from "./runtime";

export function LoginLanguageSelector({
  id,
  className = "min-w-32",
  size = "sm",
  testId = "login.language-select",
}: Pick<ComponentProps<typeof SelectTrigger>, "id" | "className" | "size"> & {
  testId?: string;
} = {}) {
  const { locale, selectLocale } = useLoginLocale();
  const t = useLoginTranslation();

  return (
    <Select<LoginLocale>
      value={locale}
      onValueChange={(value) => {
        if (value) void selectLocale(value).catch(() => undefined);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={t("auth.login.language")}
        className={className}
        size={size}
        data-testid={testId}
      >
        <span className="flex-1 text-left">{LOGIN_LOCALE_LABELS[locale]}</span>
      </SelectTrigger>
      <SelectContent>
        {LOGIN_LOCALES.map((option) => (
          <SelectItem key={option} value={option} lang={option}>
            {LOGIN_LOCALE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
