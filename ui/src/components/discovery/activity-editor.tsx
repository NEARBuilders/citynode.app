import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button, Input, Textarea } from "@/components";
import { ReportContent } from "./report-content";

type Activity = Awaited<ReturnType<ApiClient["saveDiscoveryActivity"]>>;
type Draft = Parameters<ApiClient["saveDiscoveryActivity"]>[0];
function blank(nodeId: string, kind: "event" | "social"): Draft {
  return {
    ownerNodeId: nodeId,
    nodeIds: [nodeId],
    kind,
    title: "",
    summary: "",
    url: "",
    source: "",
    publishedAt: new Date().toISOString(),
    startsAt: null,
    endsAt: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    venue: "",
    status: "draft",
  };
}
export function ActivityEditor({ nodeId }: { nodeId: string }) {
  const api = useApiClient();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const list = useQuery({
    queryKey: ["discovery-activities", nodeId],
    queryFn: () => api.listDiscoveryActivities({ nodeId }),
    retry: false,
  });
  const nodes = useQuery({
    queryKey: ["discovery-editor-nodes"],
    queryFn: () => api.listNodes({}),
  });
  const save = useMutation({
    mutationFn: (input: Draft) => api.saveDiscoveryActivity(input),
    onSuccess: () => {
      setDraft(null);
      return client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("discovery"),
      });
    },
  });
  if (list.isError) return null;
  const update = (key: keyof Draft, value: string | null) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  return (
    <section className="space-y-4 rounded-xl border border-border p-5">
      <h2 className="text-xl font-semibold">Events and social updates</h2>
      <div className="flex gap-3">
        <Button
          onClick={() => {
            save.reset();
            setDraft(blank(nodeId, "event"));
          }}
        >
          New event
        </Button>
        <Button
          onClick={() => {
            save.reset();
            setDraft(blank(nodeId, "social"));
          }}
        >
          New social update
        </Button>
      </div>
      {list.isPending && <p>Loading activity…</p>}
      {list.data?.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3">
          <span>
            {a.title} · {a.status}
          </span>
          <Button
            variant="outline"
            onClick={() => {
              save.reset();
              setDraft(a);
            }}
          >
            Edit {a.title}
          </Button>
        </div>
      ))}
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <h3 className="font-semibold">
            {draft.kind === "event" ? "Node Event" : "Social Update"}
          </h3>
          {(
            [
              ["title", "Title"],
              ["source", "Source / organizer"],
              ["url", "Original URL"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} htmlFor={`activity-${key}`} className="block">
              {label}
              <Input
                id={`activity-${key}`}
                required
                type={key === "url" ? "url" : "text"}
                maxLength={key === "url" ? 2000 : 160}
                value={draft[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
          <label htmlFor="activity-summary" className="block">
            Summary
            <Textarea
              id="activity-summary"
              maxLength={2000}
              value={draft.summary}
              onChange={(e) => update("summary", e.target.value)}
            />
          </label>
          <label htmlFor="activity-published" className="block">
            Original publication time (your local time)
            <Input
              id="activity-published"
              type="datetime-local"
              required
              value={localTime(draft.publishedAt)}
              onChange={(e) =>
                update("publishedAt", e.target.value ? new Date(e.target.value).toISOString() : "")
              }
            />
          </label>
          {draft.kind === "event" && (
            <>
              <p className="text-sm text-muted-foreground">
                Enter times in your device timezone. The display timezone controls how visitors see
                them.
              </p>
              {(
                [
                  ["startsAt", "Starts"],
                  ["endsAt", "Ends"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} htmlFor={`activity-${key}`} className="block">
                  {label}
                  <Input
                    id={`activity-${key}`}
                    type="datetime-local"
                    required
                    value={localTime(draft[key])}
                    onChange={(e) =>
                      update(key, e.target.value ? new Date(e.target.value).toISOString() : null)
                    }
                  />
                </label>
              ))}
              <label htmlFor="activity-timezone" className="block">
                Display timezone
                <Input
                  id="activity-timezone"
                  required
                  value={draft.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                />
              </label>
              <label htmlFor="activity-venue" className="block">
                Venue or online meeting location
                <Input
                  id="activity-venue"
                  required
                  value={draft.venue}
                  onChange={(e) => update("venue", e.target.value)}
                />
              </label>
              <fieldset>
                <legend>Participating nodes (editing permission required to add)</legend>
                {nodes.data?.map((n) => (
                  <label className="flex gap-2" key={n.id}>
                    <input
                      type="checkbox"
                      disabled={n.id === nodeId}
                      checked={draft.nodeIds.includes(n.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          nodeIds: e.target.checked
                            ? [...draft.nodeIds, n.id]
                            : draft.nodeIds.filter((id) => id !== n.id),
                        })
                      }
                    />
                    {n.name} · {n.kind}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          <label htmlFor="activity-status" className="block">
            Publication status
            <select
              id="activity-status"
              className="ml-3 rounded border border-border bg-background p-2"
              value={draft.status}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "draft" || value === "published" || value === "cancelled")
                  setDraft({ ...draft, status: value });
              }}
            >
              <option value="draft">Draft / unpublished</option>
              <option value="published">Published</option>
              {draft.kind === "event" && <option value="cancelled">Cancelled</option>}
            </select>
          </label>
          <div className="flex gap-3">
            <Button disabled={save.isPending}>Save activity</Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              Discard edits
            </Button>
          </div>
        </form>
      )}
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Activity saved.</p>}
    </section>
  );
}
function localTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function ActivityCard({
  activity,
  onOutbound,
}: {
  activity: Activity;
  onOutbound?: () => void;
}) {
  return (
    <article className="space-y-2 rounded-lg border border-border p-3">
      <h3 className="font-semibold">
        <Link to="/activity/$activityId" params={{ activityId: activity.id }}>
          {activity.title}
        </Link>
      </h3>
      {activity.status === "cancelled" && <p>Cancelled</p>}
      {activity.startsAt && (
        <p>
          {new Intl.DateTimeFormat(undefined, {
            timeZone: activity.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(activity.startsAt))}{" "}
          —{" "}
          {activity.endsAt &&
            new Intl.DateTimeFormat(undefined, {
              timeZone: activity.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(activity.endsAt))}{" "}
          ({activity.timezone}) · {activity.venue}
        </p>
      )}
      <p>{activity.summary}</p>
      <p className="text-sm text-muted-foreground">
        {activity.source} · {new Date(activity.publishedAt).toLocaleDateString()}
      </p>
      <a
        className="underline"
        href={activity.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOutbound}
      >
        {activity.kind === "event" ? "Event details / registration" : "Read original post"}
      </a>
      <ReportContent targetId={activity.id} kind="activity" />
    </article>
  );
}
