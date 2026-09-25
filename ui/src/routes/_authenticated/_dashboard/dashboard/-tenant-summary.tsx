import { Link } from "@tanstack/react-router";
import type { useApiClient } from "@/app";
import { Button, Card } from "@/components";
import { InfoRow } from "@/components/info-row";

type ApiClient = ReturnType<typeof useApiClient>;
type Tenant = Awaited<ReturnType<ApiClient["resolveTenant"]>>;

export function TenantSummary({ tenant }: { tenant: NonNullable<Tenant> }) {
  return (
    <Card className="p-6 space-y-4">
      <div className="text-muted-foreground text-sm font-medium">Tenant</div>
      <div className="flex flex-col gap-2">
        <InfoRow label="name" value={tenant.name} />
        <InfoRow label="id" value={tenant.id} mono />
        <InfoRow label="account" value={tenant.accountId} mono />
        <InfoRow
          label="created"
          value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/admin" preload="intent" />}
        >
          manage tenant
        </Button>
      </div>
    </Card>
  );
}
