import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Badge, Button, PageHeader } from "@/components";
import { buildTenantUrl } from "@/lib/tenant-url";
import type { TenantRecord } from "./-tenant-types";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
  pending_deletion: "Pending deletion",
};

const STATUS_BADGE = {
  active: "success",
  suspended: "warning",
  pending_deletion: "destructive",
} as const;

export function TenantHeader({
  tenant,
  hostname,
  gatewayId,
  nodeSlug,
}: {
  tenant: TenantRecord;
  hostname: string | null;
  gatewayId: string;
  nodeSlug?: string;
}) {
  const isDaoOwned = tenant.ownerKind === "dao";
  const statusVariant =
    STATUS_BADGE[tenant.status as keyof typeof STATUS_BADGE] ?? ("secondary" as const);
  const siteUrl = hostname ? (buildTenantUrl(hostname, gatewayId) ?? `https://${hostname}`) : null;

  return (
    <PageHeader
      label={
        <span className="flex flex-wrap items-center gap-1.5">
          <span>Community settings</span>
          <Badge variant={statusVariant} data-testid="tenant.status">
            {STATUS_LABEL[tenant.status] ?? tenant.status}
          </Badge>
          <Badge variant="outline">{isDaoOwned ? "DAO-owned" : "Platform"}</Badge>
        </span>
      }
      title={tenant.name}
      description={
        <span className="text-base">
          {hostname ?? "No address yet"}
          {nodeSlug ? (
            <>
              {" · "}
              <span className="font-mono">{nodeSlug}</span>
            </>
          ) : null}
        </span>
      }
      headerTestId="tenant.heading"
      actions={
        siteUrl ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a href={siteUrl} target="_blank" rel="noreferrer" data-testid="tenant.open-site">
                Open site
                <ArrowSquareOutIcon />
              </a>
            }
          />
        ) : null
      }
    />
  );
}
