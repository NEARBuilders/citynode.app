import { redirect } from "@tanstack/react-router";

const ownersOnly = { to: "/dashboard", search: { restricted: "owners" } } as const;

export function requireEventOrganizer({
  context,
  params,
}: {
  context: {
    canManageCommunity?: boolean;
    canOrganizeEvents?: boolean;
    canOperateNodes?: boolean;
  };
  params: { nodeId: string };
}) {
  const canManage = context.canManageCommunity;
  const canOrganize = context.canOrganizeEvents ?? canManage;
  if (canOrganize) return;
  if (context.canOperateNodes ?? canManage) {
    throw redirect({
      to: "/nodes/$nodeId/content",
      params: { nodeId: params.nodeId },
      search: { tab: "bulletin" },
      replace: true,
    });
  }
  throw redirect(ownersOnly);
}
