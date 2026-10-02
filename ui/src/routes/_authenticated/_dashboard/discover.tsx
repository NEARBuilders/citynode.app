import { createFileRoute } from "@tanstack/react-router";
import { Discover } from "@/components/discovery/discover";
import { PageContainer } from "@/components/layout/page-container";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/_authenticated/_dashboard/discover")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.directory",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: CuratePage,
});

function CuratePage() {
  return (
    <PageContainer variant="wide">
      <Discover />
    </PageContainer>
  );
}
