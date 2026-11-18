import { ActivityEditor } from "./activity-editor";
import { CommunityMapStatus } from "./community-map-status";

export function EventsEditor({
  nodeId,
  canOnboard,
  canManage = true,
  showMapStatus = true,
}: {
  nodeId: string;
  canOnboard?: boolean;
  canManage?: boolean;
  showMapStatus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {showMapStatus && <CommunityMapStatus nodeId={nodeId} testId="content-map-status" />}
      <ActivityEditor nodeId={nodeId} canPost={canManage} canOnboard={canOnboard} />
    </div>
  );
}
