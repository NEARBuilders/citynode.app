import { BankIcon, WarningIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button, EmptyState, PageContainer } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";

export function TenantUnavailable({ gatewayId }: { gatewayId?: string }) {
  const translate = useAppTranslation();
  return (
    <PageContainer variant="wide">
      {!gatewayId ? (
        <EmptyState
          icon={WarningIcon}
          title={translate("tenant.noGateway")}
          description={translate("tenant.domainRequired")}
          action={
            <Button variant="outline" nativeButton={false} render={<Link to="/dashboard" />}>
              {translate("common.backHome")}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={BankIcon}
          title={translate("community.notFound")}
          description={translate("tenant.notFoundDescription")}
          action={
            <Button variant="outline" nativeButton={false} render={<Link to="/dashboard" />}>
              {translate("common.backHome")}
            </Button>
          }
        />
      )}
    </PageContainer>
  );
}
