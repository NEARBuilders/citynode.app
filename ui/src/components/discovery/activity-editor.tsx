import {
  ArrowsClockwiseIcon,
  ArrowUpRightIcon,
  CalendarDotsIcon,
  ChatCircleIcon,
  ClockIcon,
  DotsThreeIcon,
  MapPinIcon,
  QrCodeIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { EmptyState } from "@/components/empty-state";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useClientValue } from "@/hooks";
import { buildEventTimeline } from "@/lib/event-timeline";
import { cn } from "@/lib/utils";
import { useStartOnboarding } from "./event-onboarding";
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
  const [lumaOpen, setLumaOpen] = useState(false);
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
  const luma = useQuery({
    queryKey: ["discovery-luma-calendars", nodeId],
    queryFn: () => api.listDiscoveryLumaCalendars({ nodeId }),
    retry: false,
    staleTime: 60_000,
  });
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const viewerTimeZone = useClientValue(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    "UTC",
  );
  const startOnboarding = useStartOnboarding();
  const save = useMutation({
    mutationFn: (input: Draft) => api.saveDiscoveryActivity(input),
    onSuccess: (saved) => {
      setDraft(null);
      toast.success(saved.status === "published" ? "Published on Explore" : "Saved");
      return client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("discovery"),
      });
    },
  });
  if (list.isError)
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn't load events and updates. Try again in a moment.
      </p>
    );
  const events = list.data?.filter((a) => a.kind === "event") ?? [];
  const posts = list.data?.filter((a) => a.kind !== "event") ?? [];
  const timeline =
    events.length > 0
      ? buildEventTimeline(events, { now: new Date(), timeZone: viewerTimeZone })
      : null;
  const openDraft = (next: Draft) => {
    save.reset();
    setDraft(next);
  };
  const rowActions = (a: Activity) => (
    <div className="flex items-center gap-1">
      {a.luma ? (
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={(props) => (
            <a {...props} href={a.url} target="_blank" rel="noopener noreferrer" />
          )}
        >
          Edit in Luma
          <ArrowUpRightIcon />
        </Button>
      ) : (
        <Button
          data-testid={`discovery-edit-activity-${a.id}`}
          variant="ghost"
          size="sm"
          aria-label={`Edit ${a.title}`}
          onClick={() => openDraft(a)}
        >
          Edit
        </Button>
      )}
      {a.kind === "event" && a.status !== "cancelled" && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${a.title}`} />}
          >
            <DotsThreeIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-testid={`activity-editor.start-onboarding-${a.id}`}
              disabled={startOnboarding.isPending}
              onClick={() => startOnboarding.mutate({ eventId: a.id })}
            >
              <QrCodeIcon />
              Start onboarding
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
  const imported = list.data?.find((activity) => activity.id === draft?.id)?.luma;
  const update = (key: keyof Draft, value: string | null) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const connection = luma.data?.connection;
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="discovery-new-event"
            onClick={() => openDraft(blank(nodeId, "event"))}
          >
            <CalendarDotsIcon /> Add event
          </Button>
          <Button
            data-testid="discovery-new-social"
            variant="outline"
            onClick={() => openDraft(blank(nodeId, "social"))}
          >
            <ChatCircleIcon /> Share a post
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          data-testid="activity-editor.luma-open"
          onClick={() => setLumaOpen(true)}
        >
          <ArrowsClockwiseIcon />
          {connection ? `Luma · ${connection.calendarName}` : "Import from Luma"}
          {connection?.error && <Badge variant="destructive">Sync failed</Badge>}
        </Button>
      </div>
      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.data?.length === 0 && (
        <EmptyState
          icon={CalendarDotsIcon}
          title="No events yet"
          description="Add your first meetup or share a post so people know what's on."
        />
      )}
      {timeline && (
        <Tabs
          value={when}
          onValueChange={(value) => setWhen(value === "past" ? "past" : "upcoming")}
        >
          <TabsList variant="line">
            <TabsTrigger value="upcoming" data-testid="activity-editor.tab-upcoming">
              Upcoming
              <Badge variant="secondary">{timeline.upcomingCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="activity-editor.tab-past">
              Past
              <Badge variant="secondary">{timeline.pastCount}</Badge>
            </TabsTrigger>
          </TabsList>
          {(["upcoming", "past"] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="pt-6">
              {timeline[tab].length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  {tab === "upcoming" ? "Nothing scheduled." : "No past events yet."}
                </p>
              ) : (
                <EventTimeline
                  groups={timeline[tab]}
                  timeZone={viewerTimeZone}
                  badges={(a) => (
                    <>
                      <Badge variant={statusVariant(a)}>{statusLabel(a)}</Badge>
                      {a.luma && <Badge variant="outline">Luma</Badge>}
                    </>
                  )}
                  actions={rowActions}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
      {posts.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-medium">Posts</h3>
          <ItemGroup>
            {posts.map((a) => (
              <Item key={a.id} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>
                    {a.title}
                    <Badge variant={statusVariant(a)}>{statusLabel(a)}</Badge>
                  </ItemTitle>
                  <ItemDescription>
                    <LocalDate value={a.publishedAt} format="relative" />
                  </ItemDescription>
                </ItemContent>
                <ItemActions>{rowActions(a)}</ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </div>
      )}
      <Dialog open={lumaOpen} onOpenChange={setLumaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Luma</DialogTitle>
            <DialogDescription>
              Public events from a Luma calendar appear here and stay in sync.
            </DialogDescription>
          </DialogHeader>
          <LumaImport nodeId={nodeId} />
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <SheetContent
          side="right"
          className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          <SheetHeader className="px-6 pt-8 pr-16">
            <SheetTitle>
              {draft?.id ? "Edit" : "New"} {draft?.kind === "event" ? "event" : "post"}
            </SheetTitle>
            <SheetDescription>
              {imported ? (
                <>
                  Synced from Luma <LocalDate value={imported.syncedAt} format="relative" />. Edit
                  details on Luma.
                  {!imported.available && " This event is no longer public there."}
                </>
              ) : draft?.kind === "event" ? (
                "When, where, and how to join."
              ) : (
                "Link to a post and add a short note."
              )}
            </SheetDescription>
          </SheetHeader>
          {draft && (
            <form
              className="flex flex-col gap-8 px-6 pb-8"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="activity-title">Title</FieldLabel>
                  <Input
                    id="activity-title"
                    readOnly={Boolean(imported)}
                    required
                    maxLength={160}
                    value={draft.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="activity-summary">Summary</FieldLabel>
                  <Textarea
                    readOnly={Boolean(imported)}
                    id="activity-summary"
                    maxLength={2000}
                    value={draft.summary}
                    onChange={(e) => update("summary", e.target.value)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="activity-url">Link</FieldLabel>
                    <Input
                      id="activity-url"
                      readOnly={Boolean(imported)}
                      required
                      type="url"
                      maxLength={2000}
                      placeholder="https://"
                      value={draft.url}
                      onChange={(e) => update("url", e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="activity-source">Organizer</FieldLabel>
                    <Input
                      id="activity-source"
                      readOnly={Boolean(imported)}
                      required
                      maxLength={160}
                      value={draft.source}
                      onChange={(e) => update("source", e.target.value)}
                    />
                  </Field>
                </div>
              </FieldGroup>
              {draft.kind === "event" ? (
                <FieldSet>
                  <FieldLegend>When and where</FieldLegend>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          ["startsAt", "Starts"],
                          ["endsAt", "Ends"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key}>
                          <FieldLabel htmlFor={`activity-${key}`}>{label}</FieldLabel>
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
                        </Field>
                      ))}
                    </div>
                    <Field>
                      <FieldLabel htmlFor="activity-timezone">Event timezone</FieldLabel>
                      <Input
                        readOnly={Boolean(imported)}
                        id="activity-timezone"
                        required
                        value={draft.timezone}
                        onChange={(e) => update("timezone", e.target.value)}
                      />
                      <FieldDescription>
                        Enter times in your own timezone; visitors see them in this one.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="activity-venue">Venue or meeting link</FieldLabel>
                      <Input
                        readOnly={Boolean(imported)}
                        id="activity-venue"
                        required
                        value={draft.venue}
                        onChange={(e) => update("venue", e.target.value)}
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>
              ) : (
                <Field>
                  <FieldLabel htmlFor="activity-published">Posted on</FieldLabel>
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
                </Field>
              )}
              {draft.kind === "event" && (nodes.data?.length ?? 0) > 1 && (
                <FieldSet>
                  <FieldLegend variant="label">Also show in</FieldLegend>
                  <FieldGroup>
                    {nodes.data
                      ?.filter((n) => n.id !== nodeId)
                      .map((n) => (
                        <Field orientation="horizontal" key={n.id}>
                          <Checkbox
                            id={`activity-node-${n.id}`}
                            checked={draft.nodeIds.includes(n.id)}
                            onCheckedChange={(checked) =>
                              setDraft({
                                ...draft,
                                nodeIds: checked
                                  ? [...draft.nodeIds, n.id]
                                  : draft.nodeIds.filter((id) => id !== n.id),
                              })
                            }
                          />
                          <FieldLabel htmlFor={`activity-node-${n.id}`}>{n.name}</FieldLabel>
                        </Field>
                      ))}
                  </FieldGroup>
                </FieldSet>
              )}
              <Field>
                <FieldLabel htmlFor="activity-status">Visibility</FieldLabel>
                <Select
                  items={[
                    { label: "Draft", value: "draft" },
                    { label: "Published on Explore", value: "published" },
                    { label: "Cancelled", value: "cancelled" },
                  ]}
                  value={draft.status}
                  onValueChange={(value) => {
                    if (value === "draft" || value === "published" || value === "cancelled")
                      setDraft({ ...draft, status: value });
                  }}
                >
                  <SelectTrigger id="activity-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published" disabled={imported?.available === false}>
                      Published on Explore
                    </SelectItem>
                    {draft.kind === "event" && (
                      <SelectItem value="cancelled" disabled={imported?.available === false}>
                        Cancelled
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>
              {save.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {save.error.message}
                </p>
              )}
              <div className="flex gap-3">
                <Button data-testid="discovery-activity-save" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
function statusVariant(activity: Activity) {
  if (activity.status === "published") return "success" as const;
  if (activity.status === "cancelled") return "destructive" as const;
  return "secondary" as const;
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
  const time = useClientValue(() => eventTimeRange(activity), null);
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
              <ClockIcon className="size-3.5 shrink-0" />
              {time}
            </p>
          )}
          {activity.kind === "event" && activity.venue && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinIcon className="size-3.5 shrink-0" />
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
              <ArrowUpRightIcon className="size-3.5" />
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
            <span className="text-sm font-medium text-muted-foreground">{tile.month}</span>
            <span className="text-xl font-semibold tabular-nums leading-none">{tile.day}</span>
          </a>
        )}
        {tile && activity.kind === "social" && (
          <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-background text-foreground">
            <span className="text-sm font-medium text-muted-foreground">{tile.month}</span>
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
