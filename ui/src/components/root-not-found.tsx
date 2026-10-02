import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AppI18nProvider, useAppTranslation } from "@/i18n/runtime";
import { DocumentFallback } from "./document-fallback";

export function RootNotFound() {
  const { locale } = useRouter().options.context;
  return (
    <AppI18nProvider initialLocale={locale}>
      <RootNotFoundContent />
    </AppI18nProvider>
  );
}

function RootNotFoundContent() {
  const translate = useAppTranslation();
  return (
    <DocumentFallback
      code="404"
      title={translate("error.notFound")}
      body={translate("error.notFoundDescription")}
      secondaryAction={
        <Button variant="outline" nativeButton={false} render={<Link to="/explore" />}>
          {translate("common.exploreCommunities")}
        </Button>
      }
    />
  );
}
