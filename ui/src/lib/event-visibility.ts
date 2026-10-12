import type { AppMessageId } from "@/i18n/catalogs";

export type EventVisibility =
  | "live"
  | "scheduled"
  | "published"
  | "draft"
  | "hiddenImport"
  | "removed"
  | "cancelled"
  | "ended";

export type VisibilityActivity = {
  kind: "event" | "social";
  status: "draft" | "published" | "cancelled";
  publishedAt: string;
  startsAt: string | null;
  endsAt: string | null;
  luma?: { available: boolean; hidden?: boolean };
};

export type VisibilityContext = {
  communityPublic: boolean | null;
  now: number;
};

export function eventVisibility(
  activity: VisibilityActivity,
  { communityPublic, now }: VisibilityContext,
): EventVisibility | null {
  if (activity.luma?.available === false) return "removed";
  if (activity.luma && (activity.luma.hidden === true || activity.status === "draft"))
    return "hiddenImport";
  if (activity.status === "draft") return "draft";
  if (activity.status === "cancelled") return "cancelled";
  if (hasEnded(activity, now)) return "ended";
  if (communityPublic === null) return null;
  if (!communityPublic) return "published";
  if (Date.parse(activity.publishedAt) > now) return "scheduled";
  return "live";
}

const saveConfirmations: Record<EventVisibility, AppMessageId> = {
  live: "events.savedLive",
  scheduled: "events.savedScheduled",
  published: "events.savedCommunityHidden",
  cancelled: "events.savedCancelled",
  draft: "events.savedDraft",
  hiddenImport: "events.savedDraft",
  removed: "events.savedDraft",
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

export function isWaitingImport(activity: VisibilityActivity, now: number) {
  if (activity.kind !== "event" || !activity.luma || activity.luma.available === false)
    return false;
  if (activity.luma.hidden !== true && activity.status !== "draft") return false;
  return !hasEnded(activity, now);
}
