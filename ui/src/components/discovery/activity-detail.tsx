import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { ActivityCard } from "./activity-editor";
import { useDiscoveryMeasurement } from "./discovery-measurement";

export function ActivityDetail({
  activityId,
  node,
  campaign,
}: {
  activityId: string;
  node?: string;
  campaign?: string;
}) {
  const api = useApiClient();
  const measurement = useDiscoveryMeasurement(api, campaign);
  const activity = useQuery({
    queryKey: ["discovery-activity", activityId],
    queryFn: () => api.getDiscoveryActivity({ id: activityId }),
    refetchInterval: 30_000,
  });
  const selectedNode =
    node && activity.data?.nodeIds.includes(node) ? node : activity.data?.ownerNodeId;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link
        to="/explore"
        search={{ node: selectedNode, campaign }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to Explore
      </Link>
      {activity.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activity.isError ? (
        <p role="alert">Couldn’t load this event.</p>
      ) : activity.data ? (
        <div className="overflow-hidden rounded-2xl border-2 border-border-strong bg-card">
          <div className="bg-muted/50">
            <ActivityCard
              activity={activity.data}
              nodeId={selectedNode}
              campaign={campaign}
              variant="detail"
              onOutbound={() => {
                if (activity.data?.kind === "event" && selectedNode)
                  measurement.track("event", selectedNode, activity.data.id);
              }}
            />
          </div>
        </div>
      ) : (
        <p>This event or post isn’t available.</p>
      )}
    </div>
  );
}
