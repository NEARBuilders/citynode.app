import { InfoIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { MemberDaoPanel } from "@/components/node-dao-member";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeDaoQueryOptions } from "@/lib/queries/node-dao";

interface CommunityNode {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
}

/** The Node DAO part of the Proposals tab: the member panel, or why there isn't one. */
export function NodeDaoSection({ node }: { node: CommunityNode }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const daoQuery = useQuery(nodeDaoQueryOptions(apiClient, node.id));

  if (daoQuery.isPending) return <Skeleton className="h-24 w-full rounded-2xl" />;
  const dao = daoQuery.data;
  if (dao?.daoAccountId && dao.network === "mainnet") {
    return (
      <MemberDaoPanel
        daoAccountId={dao.daoAccountId}
        community={{ name: node.name, slug: node.slug, parentId: node.parentId ?? undefined }}
      />
    );
  }
  return (
    <Item variant="muted" data-testid="dashboard-node.dao-proposals-note">
      <ItemMedia variant="icon">
        <InfoIcon className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{translate("dashboard.daoProposals")}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {translate(
            daoQuery.isError
              ? "daoProposals.daoError"
              : dao?.daoAccountId
                ? "daoProposals.testnet"
                : "daoProposals.noDao",
          )}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
