import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireSession } from "@/app";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: requireSession,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
