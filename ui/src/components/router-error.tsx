import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { RouterError as FrameworkRouterError } from "everything-dev/ui/router-error";
import type { ReactNode } from "react";
import { AppI18nProvider, useAppTranslation } from "@/i18n/runtime";

function BoundaryLocale({ children }: { children: ReactNode }) {
  const router = useRouter({ warn: false });
  return (
    <AppI18nProvider initialLocale={router?.options.context.locale}>{children}</AppI18nProvider>
  );
}
export function RouterError(props: Omit<ErrorComponentProps, "reset"> & { reset?: () => void }) {
  return (
    <BoundaryLocale>
      <LocalizedRouterError {...props} />
    </BoundaryLocale>
  );
}
function LocalizedRouterError(props: Omit<ErrorComponentProps, "reset"> & { reset?: () => void }) {
  const t = useAppTranslation();
  return (
    <FrameworkRouterError
      {...props}
      messages={{
        title: t("error.title"),
        body: t("error.description"),
        home: t("common.home"),
        retry: t("common.retry"),
      }}
    />
  );
}
export function RouterPending() {
  return (
    <BoundaryLocale>
      <PendingContent />
    </BoundaryLocale>
  );
}
function PendingContent() {
  const t = useAppTranslation();
  return (
    <div role="status" className="min-h-screen flex items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
    </div>
  );
}
