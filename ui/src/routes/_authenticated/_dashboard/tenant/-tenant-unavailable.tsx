import { Card, PageContainer } from "@/components";
export function TenantUnavailable({ gatewayId }: { gatewayId?: string }) {
  return (
    <PageContainer variant="wide">
      {!gatewayId ? (
        <Card className="p-6 space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Gateway not configured</h2>
          <p className="text-sm text-muted-foreground">
            The active runtime does not declare a domain, so this page cannot resolve a tenant
            address. Set <code className="font-mono">domain</code> in <code>bos.config.json</code>{" "}
            and rebuild the host. Until then, view and edit operations will not run.
          </p>
        </Card>
      ) : (
        <div className="text-muted-foreground text-sm py-12">Tenant not found.</div>
      )}
    </PageContainer>
  );
}
