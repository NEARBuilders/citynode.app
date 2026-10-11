import { ActivityEditor } from "./activity-editor";
import { HiddenProfileNotice } from "./hidden-profile-notice";

export function EventsEditor({ nodeId }: { nodeId: string }) {
  return (
    <div className="flex flex-col gap-8">
      <HiddenProfileNotice nodeId={nodeId} />
      <ActivityEditor nodeId={nodeId} />
    </div>
  );
}
