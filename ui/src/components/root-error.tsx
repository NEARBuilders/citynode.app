import { Button } from "@/components/ui/button";
import { AppI18nProvider, useAppTranslation } from "@/i18n/runtime";
import { DocumentFallback } from "./document-fallback";

export function RootError() {
  const { locale } = useRouter().options.context;
  return (
    <AppI18nProvider initialLocale={locale}>
      <RootErrorContent />
    </AppI18nProvider>
  );
}

function RootErrorContent() {
  const translate = useAppTranslation();
  return (
    <DocumentFallback
      title={translate("error.title")}
      body={translate("error.description")}
      secondaryAction={
        <Button variant="outline" onClick={() => window.location.reload()}>
          {translate("common.retry")}
        </Button>
      }
    />
  );
}

import { useRouter } from "@tanstack/react-router";
