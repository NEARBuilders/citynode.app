import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/tenants")({
  component: () => <Outlet />,
});
