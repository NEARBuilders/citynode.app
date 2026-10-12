import { EyeSlashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { discoveryProfileQueryOptions } from "./profile-editor";

export function HiddenProfileNotice({
  nodeId,
  canManage = true,
}: {
  nodeId: string;
  canManage?: boolean;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const profile = useQuery(discoveryProfileQueryOptions(api, nodeId));
  const tenantId = useQuery(nodeByIdQueryOptions(api, nodeId)).data?.tenantId;
  if (!profile.isSuccess || profile.data?.published) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-muted px-4 py-3 text-sm text-warning-muted-foreground"
      data-testid="content-not-published"
    >
      <EyeSlashIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{translate("events.profileHiddenNotice")}</span>
      {tenantId && canManage && (
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={
            <Link to="/tenant/$tenantId" params={{ tenantId }} search={{ nodeId }} hash="profile" />
          }
          data-testid="content-open-profile"
        >
          {translate("events.showOnExplore")}
        </Button>
      )}
    </div>
  );
}
