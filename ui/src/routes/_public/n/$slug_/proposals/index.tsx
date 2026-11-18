import { createFileRoute } from "@tanstack/react-router";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { DaoProposalList, NodeDaoGate } from "../../-node-dao-proposals";

export const Route = createFileRoute("/_public/n/$slug_/proposals/")({
  loader: ({ context }) => ({ runtimeConfig: context.runtimeConfig }),
  head: ({ loaderData, match }) => {
    const locale = resolveAppLocale(undefined, match.context.locale);
    return {
      meta: [
        {
          title: pageTitle(
            translateAppMessage("daoProposals.title", undefined, locale),
            loaderData?.runtimeConfig,
          ),
        },
      ],
    };
  },
  component: NodeDaoProposalsPage,
});

function NodeDaoProposalsPage() {
  const { slug } = Route.useParams();
  const target = { slug };
  return (
    <NodeDaoGate target={target}>{(resolved) => <DaoProposalList {...resolved} />}</NodeDaoGate>
  );
}
