import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Button, Input, Textarea } from "@/components";
import { DiscoveryAction } from "./discovery-action";

export function DiscoveryStudio() {
  const api = useApiClient();
  const studio = useQuery({
    queryKey: ["discovery-studio"],
    queryFn: () => api.getDiscoveryStudio(),
    retry: false,
  });
  if (studio.isPending) return <p>Loading discovery studio…</p>;
  if (studio.isError)
    return (
      <p role="alert">
        Discovery studio requires a platform administrator or an explicit growth curator grant.{" "}
        <Button onClick={() => studio.refetch()}>Try again</Button>
      </p>
    );
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Discovery studio</h1>
        <p>Curate communities and keep discovery useful.</p>
      </header>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Content checklist and freshness</h2>
        <p>
          Confirm location, describe the community, add official channels, and publish a real event
          or update. Follow up with the node’s editors when information becomes stale.
        </p>
        {studio.data.nodes.map((node) => (
          <article key={node.nodeId} className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold">{node.name}</h3>
            <p>{node.activityReason}</p>
            <ul className="list-inside list-disc">
              <li>{node.summary ? "Summary provided" : "Needs a summary"}</li>
              <li>
                {node.latitude !== null
                  ? "Location confirmed"
                  : "No map location — confirm online-only or ask editor"}
              </li>
              <li>
                {node.channels.length ? "Official channels provided" : "Needs official channels"}
              </li>
              <li>
                {node.active
                  ? "Recent community activity"
                  : "Follow up: publish a real event or update"}
              </li>
            </ul>
            {node.featured && <p>Featured: {node.featured}</p>}
            <DiscoveryAction
              label={`Feature ${node.name}`}
              run={(data) =>
                api.featureDiscoveryNode({
                  nodeId: node.nodeId,
                  label: String(data.get("label")),
                  expiresAt: new Date(String(data.get("expires"))).toISOString(),
                })
              }
            >
              <label htmlFor={`feature-label-${node.nodeId}`}>
                Feature label
                <Input id={`feature-label-${node.nodeId}`} name="label" required maxLength={80} />
              </label>
              <label htmlFor={`feature-expires-${node.nodeId}`}>
                Feature expires (your local time)
                <Input
                  id={`feature-expires-${node.nodeId}`}
                  name="expires"
                  type="datetime-local"
                  required
                />
              </label>
            </DiscoveryAction>
            <DiscoveryAction
              label={`Remove feature for ${node.name}`}
              run={() =>
                api.featureDiscoveryNode({
                  nodeId: node.nodeId,
                  label: "Expired",
                  expiresAt: new Date(0).toISOString(),
                })
              }
            />
          </article>
        ))}
        {!studio.data.nodes.length && <p>No published eligible nodes yet.</p>}
      </section>
      {studio.data.isAdmin && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Growth curator access</h2>
            <DiscoveryAction
              label="Grant curator access"
              run={(data) =>
                api.setDiscoveryCurator({ userId: String(data.get("userId")), enabled: true })
              }
            >
              <label htmlFor="curator-user">
                User ID
                <Input id="curator-user" name="userId" required />
              </label>
            </DiscoveryAction>
            {studio.data.curators.map((userId) => (
              <DiscoveryAction
                key={userId}
                label={`Revoke ${userId}`}
                run={() => api.setDiscoveryCurator({ userId, enabled: false })}
              />
            ))}
          </section>
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Visitor reports</h2>
            {studio.data.reports.map((report) => (
              <article key={report.id} className="space-y-3 rounded-xl border border-border p-4">
                <p>
                  {report.kind} · {report.targetId}
                </p>
                <p>{report.reason}</p>
                {report.resolved ? (
                  <p>Resolved: {report.note}</p>
                ) : (
                  <DiscoveryAction
                    label="Resolve report"
                    run={(data) =>
                      api.moderateDiscoveryReport({
                        reportId: report.id,
                        action: data.get("action") === "unpublish" ? "unpublish" : "dismiss",
                        note: String(data.get("note")),
                      })
                    }
                  >
                    <label htmlFor={`note-${report.id}`}>
                      Private moderation note
                      <Textarea id={`note-${report.id}`} name="note" required maxLength={1000} />
                    </label>
                    <label htmlFor={`action-${report.id}`}>
                      Action
                      <select
                        aria-label="Moderation action" id={`action-${report.id}`}
                        name="action"
                        className="ml-3 rounded border border-border bg-background p-2"
                      >
                        <option value="dismiss">Dismiss report</option>
                        <option value="unpublish">Unpublish content</option>
                      </select>
                    </label>
                  </DiscoveryAction>
                )}
              </article>
            ))}
            {!studio.data.reports.length && <p>No reports.</p>}
          </section>
        </>
      )}
    </div>
  );
}
export function DiscoveryHistory({ nodeId }: { nodeId: string }) {
  const api = useApiClient();
  const history = useQuery({
    queryKey: ["discovery-history", nodeId],
    queryFn: () => api.getDiscoveryHistory({ nodeId }),
    retry: false,
  });
  if (!history.data) return null;
  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer">Publishing history</summary>
      <ul className="space-y-2">
        {history.data.map((entry) => (
          <li key={entry.id}>
            {new Date(entry.recordedAt).toLocaleString()} · {entry.action} · {entry.actorId}
          </li>
        ))}
      </ul>
    </details>
  );
}
