import type { AppMessageId } from "@/i18n/catalogs";

export type EventVisibility = "live" | "scheduled" | "published" | "draft" | "cancelled" | "ended";

export type VisibilityActivity = {
  kind: "event" | "social";
  status: "draft" | "published" | "cancelled";
  publishedAt: string;
  startsAt: string | null;
  endsAt: string | null;
};

export type VisibilityContext = {
  communityPublic: boolean | null;
  now: number;
};

export function eventVisibility(
  activity: VisibilityActivity,
  { communityPublic, now }: VisibilityContext,
): EventVisibility | null {
  if (activity.status === "draft") return "draft";
  if (activity.status === "cancelled") return "cancelled";
  if (hasEnded(activity, now)) return "ended";
  if (communityPublic === null) return null;
  if (!communityPublic) return "published";
  if (Date.parse(activity.publishedAt) > now) return "scheduled";
  return "live";
}

export type EventTitleLink = "activity" | "edit" | null;

export function eventTitleLink(
  visibility: EventVisibility | null,
  canEdit: boolean,
): EventTitleLink {
  if (visibility === "live") return "activity";
  if (canEdit) return "edit";
  return null;
}

const saveConfirmations: Record<EventVisibility, AppMessageId> = {
  live: "events.savedLive",
  scheduled: "events.savedScheduled",
  published: "events.savedCommunityHidden",
  cancelled: "events.savedCancelled",
  draft: "events.savedDraft",
  ended: "events.savedEnded",
};

export function saveConfirmation(
  activity: VisibilityActivity,
  context: VisibilityContext,
): AppMessageId {
  const outcome = eventVisibility(activity, context);
  if (outcome === null) return "events.saved";
  if (
    outcome === "cancelled" &&
    (context.communityPublic !== true || Date.parse(activity.publishedAt) > context.now)
  )
    return "events.saved";
  return saveConfirmations[outcome];
}

function hasEnded(activity: VisibilityActivity, now: number) {
  const boundary = activity.endsAt ?? activity.startsAt;
  return activity.kind === "event" && !!boundary && Date.parse(boundary) < now;
}
