import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/_dashboard/admin/nodes/$nodeId_/edit")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/nodes/$nodeId",
      params: { nodeId: params.nodeId },
      search: { edit: true },
      replace: true,
    });
  },
});
