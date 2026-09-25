import { SparkleIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { Card, CardContent, PageHeader } from "@/components";
import { TenantCreationForm } from "./-tenant-creation-form";
import { TenantOrganizationGate } from "./-tenant-organization-gate";
import type { NearNetworkId } from "./-tenant-wizard";

export function TenantCreationStage({
  activeNetwork,
  organization,
  creation,
}: {
  activeNetwork: NearNetworkId;
  organization: {
    hasOrg: boolean;
    gate: ComponentProps<typeof TenantOrganizationGate>;
  };
  creation: ComponentProps<typeof TenantCreationForm>;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        icon={SparkleIcon}
        label="New tenant"
        title="Tenant + node creation"
        description="Create a tenant, a geographic node, and a primary domain binding in one flow."
      />

      {activeNetwork !== "mainnet" && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-foreground font-semibold">
              DAO tenant creation is mainnet-only
            </p>
            <p className="text-xs text-muted-foreground">
              Switch the network to mainnet to create tenants through your DAO account.
            </p>
          </CardContent>
        </Card>
      )}

      {!organization.hasOrg && <TenantOrganizationGate {...organization.gate} />}
      {organization.hasOrg && <TenantCreationForm {...creation} />}
    </div>
  );
}
