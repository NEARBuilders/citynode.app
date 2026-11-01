import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { DaoProposalDetail, NodeDaoGate } from "../../-node-dao-proposals";

export const Route = createFileRoute("/_public/n/$slug_/proposals/$proposalId")({
  validateSearch: z.object({ parentId: z.uuid().optional() }),
  loader: ({ context }) => ({ runtimeConfig: context.runtimeConfig }),
  head: ({ loaderData, match, params }) => {
    const locale = resolveAppLocale(undefined, match.context.locale);
    return {
      meta: [
        {
          title: pageTitle(
            translateAppMessage("daoProposals.number", { id: params.proposalId }, locale),
            loaderData?.runtimeConfig,
          ),
        },
      ],
    };
  },
  component: NodeDaoProposalPage,
});

function NodeDaoProposalPage() {
  const { slug, proposalId } = Route.useParams();
  const { parentId } = Route.useSearch();
  const target = { slug, parentId };
  return (
    <NodeDaoGate target={target}>
      {(resolved) => (
        <DaoProposalDetail {...resolved} proposalId={parseProposalId(proposalId)} target={target} />
      )}
    </NodeDaoGate>
  );
}

/** A proposal ID is a non-negative integer; anything else is shown as not found. */
function parseProposalId(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}
