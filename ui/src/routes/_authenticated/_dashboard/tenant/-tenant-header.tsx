import { BankIcon, TrashIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  PageHeader,
} from "@/components";
import type { TenantAction, TenantRecord } from "./-tenant-types";

export function TenantHeader({
  tenant,
  hostname,
  nodeSlug,
  isOwner,
  isAdmin,
  suspend,
  reactivate,
  deleting,
  onDelete,
}: {
  tenant: TenantRecord;
  hostname: string | null;
  nodeSlug?: string;
  isOwner: boolean;
  isAdmin: boolean;
  suspend: TenantAction;
  reactivate: TenantAction;
  deleting: boolean;
  onDelete: () => void;
}) {
  const isDaoOwned = tenant.ownerKind === "dao";
  const statusVariant =
    tenant.status === "active"
      ? "default"
      : tenant.status === "suspended"
        ? "destructive"
        : "secondary";
  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/dashboard" />}>dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{nodeSlug ?? tenant.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        icon={BankIcon}
        label="Tenant"
        title={tenant.name}
        subtitle={`${hostname ?? "no binding yet"} · ${tenant.accountId}`}
        headerTestId="tenant.heading"
        actions={
          <div className="flex gap-2">
            <Badge variant={isDaoOwned ? "default" : "secondary"}>
              {isDaoOwned ? "DAO-owned" : (tenant.ownerKind ?? "platform")}
            </Badge>
            <Badge variant={statusVariant}>{tenant.status}</Badge>
            {isAdmin && tenant.status === "active" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => suspend.mutate()}
                disabled={suspend.isPending}
              >
                suspend
              </Button>
            )}
            {isAdmin && tenant.status === "suspended" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reactivate.mutate()}
                disabled={reactivate.isPending}
              >
                reactivate
              </Button>
            )}
            {isOwner && tenant.status === "active" && (
              <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
                <TrashIcon className="h-3.5 w-3.5" />
                delete
              </Button>
            )}
          </div>
        }
      />
    </>
  );
}
