import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_admin/admin/tenants")({
  component: () => <Outlet />,
});
