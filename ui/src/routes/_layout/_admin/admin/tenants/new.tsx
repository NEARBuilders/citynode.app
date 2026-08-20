import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components";
import { PageContainer } from "@/components/layout/page-container";

export const Route = createFileRoute("/_layout/_admin/admin/tenants/new")({
  head: () => ({
    title: "New Tenant | app",
    meta: [{ name: "description", content: "Create a new tenant." }],
  }),
  component: NewTenantPage,
});

function NewTenantPage() {
  return (
    <PageContainer variant="narrow">
      <div className="space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            New tenant
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Tenant + node creation
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The creation wizard is being redesigned to create a tenant, a geographic node, and a
            primary domain binding in one flow.
          </p>
        </header>

        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-foreground">
              This flow ships with issue 04 — see the issue tracker for progress. In the meantime,
              the underlying API supports <code className="font-mono text-xs">createTenant</code>,{" "}
              <code className="font-mono text-xs">createNode</code>, and{" "}
              <code className="font-mono text-xs">createBinding</code> as separate steps.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
