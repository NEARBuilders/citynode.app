import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { sessionQueryOptions } from "@/app";
import { EmptyState, PageContainer } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Admin | app" }, { name: "description", content: "Admin panel." }],
  }),
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.authClient, context.session),
    );
  },
  component: AdminPage,
});

function AdminPage() {
  return (
    <PageContainer variant="wide">
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Shield size={14} />
            <span>Administration</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Admin</h1>
          <p className="text-sm text-muted-foreground">Manage platform settings and user access.</p>
        </header>

        <EmptyState
          icon={Shield}
          title="No admin access"
          description="You don't have the permissions required to view this page."
        />
      </div>
    </PageContainer>
  );
}
