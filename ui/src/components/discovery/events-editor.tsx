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
}: {
  nodeId: string;
  tenantStatus: TenantStatus | null | undefined;
  profileLink?: ReactElement;
  reviewImports?: boolean;
}) {
  const api = useApiClient();
  const profile = useQuery(discoveryProfileQueryOptions(api, nodeId));
  return (
    <div className="flex flex-col gap-8">
      {profile.isSuccess && (
        <CommunityMapStatus
          nodeId={nodeId}
          tenantStatus={tenantStatus}
          published={profile.data?.published ?? false}
          settingsLink={profileLink}
          hiddenHint="community.hiddenHint"
          testId="content-map-status"
        />
      )}
      <ActivityEditor nodeId={nodeId} reviewImports={reviewImports} />
    </div>
  );
}
