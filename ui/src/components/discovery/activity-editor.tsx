import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, Clock, MapPin, MessageCircle, QrCode } from "lucide-react";
import { useState } from "react";
import { type ApiClient, useApiClient } from "@/app";
import {
  Badge,
  Button,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { buildEventTimeline } from "@/lib/event-timeline";
import { cn } from "@/lib/utils";
import { EventTimeline } from "./event-timeline";
import { LumaImport } from "./luma-import";
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
    refetchInterval: 30_000,
  });
  const nodes = useQuery({
    queryKey: ["discovery-editor-nodes"],
    queryFn: () => api.listNodes({}),
  });
  const navigate = useNavigate();
  const [maxJoins, setMaxJoins] = useState("");
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const [viewerTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const startOnboarding = useMutation({
    mutationFn: (eventId: string) => {
      const maxUses = Number.parseInt(maxJoins, 10);
      return api.createEventOnboardingCode({
        eventId,
        ...(Number.isInteger(maxUses) && maxUses > 0 ? { maxUses: Math.min(maxUses, 500) } : {}),
      });
    },
    onSuccess: (code) =>
      navigate({ to: "/onboarding/station/$codeId", params: { codeId: code.id } }),
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
  if (list.isError)
    return (
      <p role="alert" className="rounded-xl border border-border p-4 text-sm">
        Unable to load events and updates. Try again in a moment.
      </p>
    );
  const events = list.data?.filter((a) => a.kind === "event") ?? [];
  const posts = list.data?.filter((a) => a.kind !== "event") ?? [];
  const timeline =
    events.length > 0
      ? buildEventTimeline(events, { now: new Date(), timeZone: viewerTimeZone })
      : null;
  const rowActions = (a: Activity) => (
    <>
      {a.kind === "event" && a.status !== "cancelled" && (
        <Button
          data-testid={`discovery-start-onboarding-${a.id}`}
          variant="outline"
          size="sm"
          disabled={startOnboarding.isPending}
          onClick={() => startOnboarding.mutate(a.id)}
        >
          <QrCode /> Start onboarding
        </Button>
      )}
      {a.luma ? (
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Manage in Luma
        </a>
      ) : (
        <Button
          data-testid={`discovery-edit-activity-${a.id}`}
          variant="outline"
          size="sm"
          onClick={() => {
            save.reset();
            setDraft(a);
          }}
        >
          Edit {a.title}
        </Button>
      )}
    </>
  );
  const imported = list.data?.find((activity) => activity.id === draft?.id)?.luma;
  const update = (key: keyof Draft, value: string | null) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold tracking-tight">Events & updates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a meetup or share a post. Save a draft, or publish when you’re ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="discovery-new-event"
            onClick={() => {
              save.reset();
              setDraft(blank(nodeId, "event"));
            }}
          >
            <CalendarDays /> Add an event
          </Button>
          <Button
            data-testid="discovery-new-social"
            variant="outline"
            onClick={() => {
              save.reset();
              setDraft(blank(nodeId, "social"));
            }}
          >
            <MessageCircle /> Share a post
          </Button>
        </div>
      </div>
      <LumaImport nodeId={nodeId} />
      {list.data?.some((a) => a.kind === "event" && a.status !== "cancelled") && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="discovery-onboarding-max-joins">Max joins per onboarding code</label>
          <Input
            id="discovery-onboarding-max-joins"
            data-testid="discovery-onboarding-max-joins"
            className="w-24"
            inputMode="numeric"
            placeholder="50"
            value={maxJoins}
            onChange={(event) => setMaxJoins(event.target.value)}
          />
        </div>
      )}
      {startOnboarding.isError && (
        <p
          role="alert"
          className="rounded-xl border border-border p-4 text-sm"
          data-testid="discovery-start-onboarding-error"
        >
          {startOnboarding.error.message || "Could not start onboarding for this event."}
        </p>
      )}
      {list.isPending && <p className="text-sm text-muted-foreground">Loading events…</p>}
      {list.data?.length === 0 && (
        <p className="rounded-xl bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing here yet. Add your first event or share a post above.
        </p>
      )}
      {timeline && (
        <Tabs
          value={when}
          onValueChange={(value) => setWhen(value === "past" ? "past" : "upcoming")}
        >
          <TabsList className="justify-start">
            <TabsTrigger
              value="upcoming"
              className="gap-1.5"
              data-testid="activity-editor.tab-upcoming"
            >
              Upcoming
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {timeline.upcomingCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="past" className="gap-1.5" data-testid="activity-editor.tab-past">
              Past
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {timeline.pastCount}
              </span>
            </TabsTrigger>
          </TabsList>
          {(["upcoming", "past"] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="pt-4">
              {timeline[tab].length === 0 ? (
                <p className="rounded-xl bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground">
                  {tab === "upcoming" ? "No upcoming events." : "No past events yet."}
                </p>
              ) : (
                <EventTimeline
                  groups={timeline[tab]}
                  timeZone={viewerTimeZone}
                  badges={(a) => (
                    <>
                      <Badge variant={a.status === "published" ? "success" : "secondary"}>
                        {statusLabel(a)}
                      </Badge>
                      {a.luma && <Badge variant="outline">From Luma</Badge>}
                    </>
                  )}
                  actions={rowActions}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
      {posts.length > 0 && timeline && (
        <h3 className="text-sm font-medium text-muted-foreground">Posts</h3>
      )}
      {posts.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-border-strong bg-card">
          {posts.map((a) => {
            const tile = eventDateTile(a);
            return (
              <div
                key={a.id}
                className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {statusLabel(a)}
                    {a.luma ? " · From Luma — updates automatically" : ""}
                  </p>
                </div>
                {tile && (
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {tile.month}
                    </span>
                    <span className="text-base font-semibold tabular-nums leading-none">
                      {tile.day}
                    </span>
                  </div>
                )}
                {rowActions(a)}
              </div>
            );
          })}
        </div>
      )}
      <Sheet
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="px-6 pb-4 pt-8 pr-16">
            <SheetTitle className="text-xl">
              {draft?.id ? "Edit" : "Add"}{" "}
              {draft?.kind === "event" ? "an event" : "a community post"}
            </SheetTitle>
            <SheetDescription>
              {draft?.kind === "event"
                ? "Let people know when, where, and how to join."
                : "Share a post and add a short note."}
            </SheetDescription>
          </SheetHeader>
          {draft && (
            <form
              className="flex flex-col gap-5 px-6 pb-8 [&_label]:text-sm [&_label]:font-medium [&_input]:mt-1.5 [&_textarea]:mt-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
            >
              {imported && (
                <p className="text-sm text-muted-foreground">
                  Edit details on{" "}
                  <a
                    href={draft.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Luma
                  </a>
                  . Changes appear automatically. Last updated{" "}
                  {new Date(imported.syncedAt).toLocaleString()}.
                  {!imported.available && " This event is no longer public on Luma."}
                </p>
              )}
              {(
                [
                  ["title", "Title"],
                  ["source", "Organizer"],
                  ["url", "Link"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} htmlFor={`activity-${key}`} className="block">
                  {label}
                  <Input
                    id={`activity-${key}`}
                    readOnly={Boolean(imported)}
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
                  readOnly={Boolean(imported)}
                  id="activity-summary"
                  maxLength={2000}
                  value={draft.summary}
                  onChange={(e) => update("summary", e.target.value)}
                />
              </label>
              <label htmlFor="activity-published" className="block">
                Posted on
                <Input
                  readOnly={Boolean(imported)}
                  id="activity-published"
                  type="datetime-local"
                  required
                  value={localTime(draft.publishedAt)}
                  onChange={(e) =>
                    update(
                      "publishedAt",
                      e.target.value ? new Date(e.target.value).toISOString() : "",
                    )
                  }
                />
              </label>
              {draft.kind === "event" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter times in your timezone. Visitors will see them in the event timezone you
                    pick below.
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
                        readOnly={Boolean(imported)}
                        type="datetime-local"
                        required
                        value={localTime(draft[key])}
                        onChange={(e) =>
                          update(
                            key,
                            e.target.value ? new Date(e.target.value).toISOString() : null,
                          )
                        }
                      />
                    </label>
                  ))}
                  <label htmlFor="activity-timezone" className="block">
                    Timezone
                    <Input
                      readOnly={Boolean(imported)}
                      id="activity-timezone"
                      required
                      value={draft.timezone}
                      onChange={(e) => update("timezone", e.target.value)}
                    />
                  </label>
                  <label htmlFor="activity-venue" className="block">
                    Venue or online meeting location
                    <Input
                      readOnly={Boolean(imported)}
                      id="activity-venue"
                      required
                      value={draft.venue}
                      onChange={(e) => update("venue", e.target.value)}
                    />
                  </label>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium">
                      Also show this event in these communities
                    </legend>
                    {nodes.data?.map((n) => (
                      <label className="flex items-center gap-2 text-sm" key={n.id}>
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
                        {n.name}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              <label htmlFor="activity-status" className="block">
                Who can see this
                <select
                  id="activity-status"
                  className="mt-1.5 h-10 w-full rounded-[12px] border-2 border-inset border-border-strong bg-card px-3"
                  value={draft.status}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "draft" || value === "published" || value === "cancelled")
                      setDraft({ ...draft, status: value });
                  }}
                >
                  <option value="draft">Keep as draft</option>
                  <option value="published" disabled={imported?.available === false}>
                    Publish on Explore
                  </option>
                  {draft.kind === "event" && (
                    <option value="cancelled" disabled={imported?.available === false}>
                      Mark as cancelled
                    </option>
                  )}
                </select>
              </label>
              {save.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {save.error.message}
                </p>
              )}
              <div className="flex gap-3">
                <Button data-testid="discovery-activity-save" disabled={save.isPending}>
                  Save changes
                </Button>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Discard edits
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Saved.</p>}
    </section>
  );
}
function statusLabel(activity: Activity) {
  if (activity.status === "draft") return "Draft";
  if (activity.status === "cancelled") return "Cancelled";
  return "Published";
}
function localTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function eventDateKey(activity: Activity) {
  if (!activity.startsAt) return "undated";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: activity.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(activity.startsAt));
}
function eventDateLabel(activity: Activity) {
  if (!activity.startsAt) return "Date to be announced";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: activity.timezone,
    month: "short",
    day: "numeric",
    weekday: "long",
  }).formatToParts(new Date(activity.startsAt));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("month")} ${value("day")} ${value("weekday")}`;
}
function eventTimeRange(activity: Activity) {
  if (!activity.startsAt) return null;
  const start = new Intl.DateTimeFormat(undefined, {
    timeZone: activity.timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(activity.startsAt));
  if (!activity.endsAt) return start;
  const end = new Intl.DateTimeFormat(undefined, {
    timeZone: activity.timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(activity.endsAt));
  return `${start} – ${end}`;
}
function eventDateTile(activity: Activity) {
  const instant = activity.startsAt ?? activity.publishedAt;
  if (!instant) return null;
  const date = new Date(instant);
  const zone = activity.startsAt ? activity.timezone : undefined;
  return {
    month: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short" }).format(date),
    day: new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "numeric" }).format(date),
  };
}
export function EventCalendar({
  events,
  nodeId,
  campaign,
  onOutbound,
}: {
  events: Activity[];
  nodeId?: string;
  campaign?: string;
  onOutbound?: (activity: Activity) => void;
}) {
  const groups: { key: string; label: string; events: Activity[] }[] = [];
  for (const activity of events) {
    const key = eventDateKey(activity);
    const current = groups.find((group) => group.key === key);
    if (current) current.events.push(activity);
    else groups.push({ key, label: eventDateLabel(activity), events: [activity] });
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            {group.label}
          </h3>
          <div className="flex flex-col overflow-hidden rounded-xl bg-muted/50">
            {group.events.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                nodeId={nodeId}
                campaign={campaign}
                onOutbound={onOutbound ? () => onOutbound(activity) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
export function ActivityCard({
  activity,
  onOutbound,
  nodeId,
  campaign,
  variant = "list",
}: {
  activity: Activity;
  onOutbound?: () => void;
  nodeId?: string;
  campaign?: string;
  variant?: "list" | "detail";
}) {
  const tile = eventDateTile(activity);
  const time = eventTimeRange(activity);
  const cancelled = activity.status === "cancelled";
  return (
    <article className="flex flex-col gap-4">
      <div className={cn("flex items-center gap-4 px-4 py-3.5", cancelled && "opacity-60")}>
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-medium leading-snug", cancelled && "line-through")}>
            <Link
              data-testid={`discovery-activity-detail-${activity.id}`}
              to="/activity/$activityId"
              params={{ activityId: activity.id }}
              search={{ node: nodeId, campaign }}
            >
              {activity.title}
            </Link>
          </h3>
          {cancelled && <p className="mt-1 text-xs font-medium">Cancelled</p>}
          {time && (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-3.5 shrink-0" />
              {time}
            </p>
          )}
          {activity.kind === "event" && activity.venue && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {activity.venue}
            </p>
          )}
          {activity.kind === "social" && (
            <a
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium"
              data-testid={`discovery-activity-outbound-${activity.id}`}
              href={activity.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOutbound}
            >
              Read original post
              <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
        {tile && activity.kind === "event" && (
          <a
            className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-background text-foreground"
            data-testid={`discovery-activity-outbound-${activity.id}`}
            href={activity.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOutbound}
            aria-label="Event details"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tile.month}
            </span>
            <span className="text-xl font-semibold tabular-nums leading-none">{tile.day}</span>
          </a>
        )}
        {tile && activity.kind === "social" && (
          <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-background text-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tile.month}
            </span>
            <span className="text-xl font-semibold tabular-nums leading-none">{tile.day}</span>
          </div>
        )}
      </div>
      {variant === "detail" && (
        <div className="flex flex-col gap-3 border-t border-border bg-card px-4 py-4">
          {activity.summary && (
            <p className="text-sm leading-relaxed text-muted-foreground">{activity.summary}</p>
          )}
          {activity.luma && (
            <p className="text-sm text-muted-foreground">Details and registration are on Luma.</p>
          )}
          <ReportContent targetId={activity.id} kind="activity" />
        </div>
      )}
    </article>
  );
}
