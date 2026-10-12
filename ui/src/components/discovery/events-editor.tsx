import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApiClient } from "@/app";
import type { TenantStatus } from "@/lib/community-map-status";
import { ActivityEditor } from "./activity-editor";
import { CommunityMapStatus } from "./community-map-status";
import { discoveryProfileQueryOptions } from "./profile-editor";

export function EventsEditor({
  nodeId,
  tenantStatus,
  profileLink,
  reviewImports,
  canManage = true,
}: {
  nodeId: string;
  tenantStatus: TenantStatus | undefined;
  profileLink?: ReactElement;
  reviewImports?: boolean;
  canManage?: boolean;
}) {
  const api = useApiClient();
  const profile = useQuery(discoveryProfileQueryOptions(api, nodeId));
  return (
    <div className="flex flex-col gap-8">
      {profile.isSuccess && (
        <CommunityMapStatus
          nodeId={nodeId}
          tenantStatus={tenantStatus}
          settingsLink={canManage ? profileLink : undefined}
          hiddenHint="community.hiddenHint"
          testId="content-map-status"
        />
      )}
      <ActivityEditor nodeId={nodeId} reviewImports={reviewImports} canPost={canManage} />
    </div>
  );
}
