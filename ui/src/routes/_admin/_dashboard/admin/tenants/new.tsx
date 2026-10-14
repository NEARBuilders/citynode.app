import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/_dashboard/admin/tenants/new")({
  beforeLoad: () => {
    throw redirect({ to: "/apply", replace: true });
  },
});
