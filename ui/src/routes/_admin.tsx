import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth-guards";

export const Route = createFileRoute("/_admin")({
  beforeLoad: requireAdmin,
  component: AdminGate,
});

function AdminGate() {
  return <Outlet />;
}
