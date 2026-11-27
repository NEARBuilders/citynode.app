import { createFileRoute } from "@tanstack/react-router";
import { AccountCollectibles } from "@/components/account-collectibles";

export const Route = createFileRoute("/_public/$accountId/")({
  component: AccountOverviewPage,
});

function AccountOverviewPage() {
  const { accountId } = Route.useParams();
  return <AccountCollectibles accountId={accountId} />;
}
