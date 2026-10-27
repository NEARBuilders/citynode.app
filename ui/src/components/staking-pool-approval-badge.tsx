import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import { useAppTranslation } from "@/i18n/runtime";
import { stakingPoolApprovalQueryOptions } from "@/lib/queries/stake-pool";

export function StakingPoolApprovalBadge({
  accountId,
  network,
  protocol,
}: {
  accountId: string;
  network: string;
  protocol: string;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const { data } = useQuery({
    ...stakingPoolApprovalQueryOptions(apiClient, accountId, network),
    enabled: protocol === "near" && !!accountId,
  });

  if (data?.approved !== false) return null;
  return (
    <Badge
      variant="destructive"
      title={translate("tenant.notApprovedPoolDescription")}
      data-testid="validator.not-approved-pool"
    >
      {translate("tenant.notApprovedPool")}
    </Badge>
  );
}
