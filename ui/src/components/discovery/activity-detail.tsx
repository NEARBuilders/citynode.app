import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { ActivityCard } from "./activity-editor";
import { MeasurementPreference, useDiscoveryMeasurement } from "./discovery-measurement";
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
    <div className="space-y-5">
      <Link to="/explore" search={{ node: selectedNode, campaign }} className="underline">
        Explore nodes
      </Link>
      <MeasurementPreference consent={measurement.consent} choose={measurement.choose} />
      {activity.isPending ? (
        <p>Loading activity…</p>
      ) : activity.isError ? (
        <p role="alert">Unable to load activity.</p>
      ) : activity.data ? (
        <ActivityCard
          activity={activity.data}
          nodeId={selectedNode}
          campaign={campaign}
          onOutbound={() => {
            if (activity.data?.kind === "event" && selectedNode)
              measurement.track("event", selectedNode, activity.data.id);
          }}
        />
      ) : (
        <p>This activity is unavailable.</p>
      )}
    </div>
  );
}
