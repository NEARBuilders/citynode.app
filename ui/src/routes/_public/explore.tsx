import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useApiClient } from "@/app";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";
import { PageContainer } from "@/components/layout/page-container";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { socialMeta } from "@/lib/social-meta";
export const Route = createFileRoute("/_public/explore")({
  validateSearch: z.object({
    campaign: z
      .string()
      .max(80)
      .regex(/^[a-zA-Z0-9_-]*$/)
      .optional()
      .catch(undefined),
    active: z.boolean().optional().catch(undefined),
    upcoming: z.boolean().optional().catch(undefined),
    node: z.uuid().optional().catch(undefined),
    query: z.string().max(120).optional().catch(undefined),
    region: z.string().max(120).optional().catch(undefined),
    view: z.enum(["list", "map"]).optional().catch(undefined),
  }),
  head: ({ match }) => {
    const locale = resolveAppLocale(undefined, match.context.locale);
    const title = pageTitle(
      translateAppMessage("nav.explore", undefined, locale),
      match.context.runtimeConfig,
    );
    const description = translateAppMessage("meta.exploreDescription", undefined, locale);

    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({
          title,
          description,
          path: "/explore",
          runtimeConfig: match.context.runtimeConfig,
        }),
      ],
    };
  },
  component: Explore,
});
function Explore() {
  const api = useApiClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PageContainer variant="wide">
      <DiscoveryExplorer
        api={api}
        search={search}
        navigate={(next) => navigate({ search: next })}
      />
    </PageContainer>
  );
}
