import { HammerIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { BuildPrompts } from "./-build-prompts";

export const Route = createFileRoute("/_public/build")({
  head: ({ match }) => ({
    meta: [
      {
        title: translateAppMessage(
          "nav.build",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: BuildPage,
});

function BuildPage() {
  const translate = useAppTranslation();
  return (
    <PageContainer variant="narrow">
      <PageHeader
        headerTestId="build.heading"
        icon={HammerIcon}
        title={translate("build.ready")}
        description={translate("build.description")}
      />
      <BuildPrompts />
    </PageContainer>
  );
}
