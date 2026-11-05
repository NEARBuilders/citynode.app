import { LinkBreakIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button, EmptyState } from "@/components";
import { isNotFoundError } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/_public/go/$slug")({
  loader: async ({ params, context }) => {
    let destination: string;
    try {
      ({ destination } = await context.apiClient.openOnboardingLink({ slug: params.slug }));
    } catch (error) {
      if (isNotFoundError(error)) return { inactive: true };
      throw error;
    }
    throw redirect({ href: destination, reloadDocument: true, replace: true });
  },
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "links.inactiveTitle",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: InactiveOnboardingLink,
});

function InactiveOnboardingLink() {
  const translate = useAppTranslation();
  return (
    <EmptyState
      icon={LinkBreakIcon}
      title={translate("links.inactiveTitle")}
      description={translate("links.inactiveDescription")}
      action={
        <Button nativeButton={false} render={<Link to="/" data-testid="links.inactive-home" />}>
          {translate("links.inactiveHome")}
        </Button>
      }
    />
  );
}
