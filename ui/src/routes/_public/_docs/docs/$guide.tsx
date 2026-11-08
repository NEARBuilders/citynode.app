import { BookOpenIcon } from "@phosphor-icons/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components";
import { Markdown } from "@/components/markdown";
import { resolveAppLocale, useAppTranslation } from "@/i18n/runtime";
import { resolveGuide } from "@/lib/docs-guides";
import { pageTitle } from "@/lib/page-title";
import { socialMeta } from "@/lib/social-meta";

export function loadGuide(slug: string, locale?: string | null, files?: Record<string, string>) {
  const guide = resolveGuide(slug, resolveAppLocale(undefined, locale), files);
  if (!guide) throw notFound();
  return guide;
}

export const Route = createFileRoute("/_public/_docs/docs/$guide")({
  loader: ({ params, context }) => {
    const guide = loadGuide(params.guide, context.locale);
    return { guide, runtimeConfig: context.runtimeConfig };
  },
  head: ({ loaderData, match, params }) => {
    const title = pageTitle(loaderData?.guide.title ?? params.guide, loaderData?.runtimeConfig);
    const description = loaderData?.guide.description ?? "";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({
          title,
          description,
          path: `/docs/${params.guide}`,
          runtimeConfig: loaderData?.runtimeConfig ?? match.context.runtimeConfig,
        }),
      ],
    };
  },
  component: GuidePage,
});

function GuidePage() {
  const translate = useAppTranslation();
  const { guide } = Route.useLoaderData();

  return (
    <PageContainer variant="default" className="min-w-0">
      <PageHeader
        headerTestId="docs.guide-heading"
        icon={BookOpenIcon}
        label={translate("docs.nav.guides")}
        title={guide.title}
      />
      <div className="min-w-0 overflow-x-auto">
        <Markdown content={guide.body} className="min-w-0" />
      </div>
    </PageContainer>
  );
}
