import { createFileRoute, Link } from "@tanstack/react-router";
import { getAppName } from "@/app";
import { useClientValue } from "@/hooks/use-client";

export const Route = createFileRoute("/_layout/_authenticated/_admin/dashboard")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const appName = useClientValue(() => getAppName(), "app");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div className="flex items-center gap-2 text-xs font-mono">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            {appName}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">admin</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">Admin dashboard placeholder.</p>
    </div>
  );
}
