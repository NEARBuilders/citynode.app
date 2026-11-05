import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/_dashboard/admin/organizations")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/proposals", replace: true });
  },
});
