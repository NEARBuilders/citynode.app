import { ActivityEditor } from "./activity-editor";
import { HiddenProfileNotice } from "./hidden-profile-notice";

export function EventsEditor({
  nodeId,
  canManage = true,
}: {
  nodeId: string;
  canManage?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <HiddenProfileNotice nodeId={nodeId} canManage={canManage} />
      <ActivityEditor nodeId={nodeId} canPost={canManage} />
    </div>
  );
}
