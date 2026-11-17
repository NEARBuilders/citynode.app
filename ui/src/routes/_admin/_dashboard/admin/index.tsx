import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/_dashboard/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
