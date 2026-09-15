import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { ActivityCard } from "@/components/discovery/activity-editor";
import { PageContainer } from "@/components/layout/page-container";
export const Route = createFileRoute("/_layout/_public/activity/$activityId")({
  component: ActivityPage,
});
function ActivityPage() {
  const { activityId } = Route.useParams();
  const api = useApiClient();
  const activity = useQuery({
    queryKey: ["discovery-activity", activityId],
    queryFn: () => api.getDiscoveryActivity({ id: activityId }),
    refetchInterval: 30_000,
  });
  return (
    <PageContainer>
      <Link to="/explore" className="underline">
        Explore nodes
      </Link>
      <div className="mt-6">
        {activity.isPending ? (
          <p>Loading activity…</p>
        ) : activity.isError ? (
          <p role="alert">Unable to load activity.</p>
        ) : activity.data ? (
          <ActivityCard activity={activity.data} />
        ) : (
          <p>This activity is unavailable.</p>
        )}
      </div>
    </PageContainer>
  );
}
