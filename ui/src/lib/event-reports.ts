import type { ApiClient } from "@/app";
import { eventVisibility, type VisibilityActivity } from "@/lib/event-visibility";

export type EventReport = Parameters<ApiClient["saveEventReport"]>[0]["report"];
export type ReportAudience = EventReport["audiences"][number];

export const DAY_MS = 24 * 3_600_000;
const WEEK_MS = 7 * DAY_MS;

export type EventReportStatus =
  | { state: "notDue" }
  | { state: "missing" }
  | { state: "submitted"; late: boolean };

export function eventEndsAt(event: { startsAt: string | null; endsAt: string | null }): number {
  return Date.parse(event.endsAt ?? event.startsAt ?? "");
}

export function eventsMissingReports<T extends VisibilityActivity & { id: string }>(
  activities: readonly T[],
  statuses: readonly { activityId: string; submittedAt: string }[],
  now: number,
): T[] {
  const submitted = new Map(statuses.map((status) => [status.activityId, status.submittedAt]));
  return activities
    .filter((activity) => eventVisibility(activity, { communityPublic: true, now }) === "ended")
    .filter(
      (activity) =>
        eventReportStatus(activity, submitted.get(activity.id) ?? null, now).state === "missing",
    )
    .sort((a, b) => eventEndsAt(b) - eventEndsAt(a));
}

export function eventReportStatus(
  event: { startsAt: string | null; endsAt: string | null },
  submittedAt: string | null | undefined,
  now: number,
): EventReportStatus {
  const end = eventEndsAt(event);
  if (submittedAt) {
    return {
      state: "submitted",
      late: Number.isFinite(end) && Date.parse(submittedAt) > end + WEEK_MS,
    };
  }
  if (!Number.isFinite(end) || end > now) return { state: "notDue" };
  return { state: "missing" };
}

export function reportedWithinWeek(
  events: readonly {
    startsAt: string | null;
    endsAt: string | null;
    reportSubmittedAt: string | null;
  }[],
  now: number,
): { onTime: number; due: number } {
  let onTime = 0;
  let due = 0;
  for (const event of events) {
    const status = eventReportStatus(event, event.reportSubmittedAt, now);
    if (status.state === "notDue") continue;
    due += 1;
    if (status.state === "submitted" && !status.late) onTime += 1;
  }
  return { onTime, due };
}

function everyValueOf<T>() {
  return <const A extends readonly T[]>(
    values: A & ([Exclude<T, A[number]>] extends [never] ? unknown : never),
  ): readonly T[] => values;
}

export const REPORT_AUDIENCES = everyValueOf<ReportAudience>()([
  "general",
  "developers",
  "academic",
  "smb",
  "other",
]);
const REPORT_FORMATS = everyValueOf<EventReport["format"]>()(["irl", "online"]);
const REPORT_FOCUSES = everyValueOf<EventReport["focus"]>()(["ai", "crypto"]);

type LongTextId =
  | "theme"
  | "wentWell"
  | "improvements"
  | "talentAfter"
  | "talentDuring"
  | "materialsNeeded"
  | "nextActions"
  | "insights";

type LinksId = "socialLinks" | "slideLinks" | "mediaLinks";

export type ReportQuestion =
  | { id: "format"; kind: "choice"; options: readonly EventReport["format"][]; required: true }
  | { id: "focus"; kind: "choice"; options: readonly EventReport["focus"][]; required: true }
  | { id: "audiences"; kind: "audiences"; required: true }
  | { id: "attendees"; kind: "number"; required: true }
  | { id: "kpis"; kind: "kpis"; required: true }
  | { id: "hadPartners"; kind: "partners"; required: true }
  | { id: LongTextId; kind: "longText"; required: boolean }
  | { id: LinksId; kind: "links"; required: boolean };

export const REPORT_QUESTIONS: readonly ReportQuestion[] = [
  { id: "format", kind: "choice", options: REPORT_FORMATS, required: true },
  { id: "socialLinks", kind: "links", required: true },
  { id: "focus", kind: "choice", options: REPORT_FOCUSES, required: true },
  { id: "audiences", kind: "audiences", required: true },
  { id: "theme", kind: "longText", required: true },
  { id: "attendees", kind: "number", required: true },
  { id: "slideLinks", kind: "links", required: false },
  { id: "kpis", kind: "kpis", required: true },
  { id: "wentWell", kind: "longText", required: true },
  { id: "improvements", kind: "longText", required: true },
  { id: "talentAfter", kind: "longText", required: true },
  { id: "talentDuring", kind: "longText", required: true },
  { id: "materialsNeeded", kind: "longText", required: false },
  { id: "hadPartners", kind: "partners", required: true },
  { id: "nextActions", kind: "longText", required: true },
  { id: "insights", kind: "longText", required: false },
  { id: "mediaLinks", kind: "links", required: false },
];

export type ReportDraft = {
  format: EventReport["format"] | "";
  focus: EventReport["focus"] | "";
  audiences: ReportAudience[];
  audienceOther: string;
  attendees: string;
  kpis: [string, string, string];
  hadPartners: boolean | null;
  partners: string;
} & Record<LongTextId, string> &
  Record<LinksId, string>;

export function emptyReportDraft(attendees: number | null): ReportDraft {
  return {
    format: "",
    focus: "",
    audiences: [],
    audienceOther: "",
    attendees: attendees === null ? "" : String(attendees),
    kpis: ["", "", ""],
    hadPartners: null,
    partners: "",
    theme: "",
    wentWell: "",
    improvements: "",
    talentAfter: "",
    talentDuring: "",
    materialsNeeded: "",
    nextActions: "",
    insights: "",
    socialLinks: "",
    slideLinks: "",
    mediaLinks: "",
  };
}

export function draftFromReport(report: EventReport): ReportDraft {
  return {
    ...report,
    attendees: String(report.attendees),
    socialLinks: report.socialLinks.join("\n"),
    slideLinks: report.slideLinks.join("\n"),
    mediaLinks: report.mediaLinks.join("\n"),
  };
}

export type ReportFieldError = "required" | "invalidLink" | "invalidNumber" | "tooManyLinks";

const REPORT_LINKS_MAX = 20;
const REPORT_LINK_LENGTH_MAX = 2000;
const REPORT_ATTENDEES_MAX = 100_000;

function links(value: string) {
  return value
    .split(/\s+/)
    .map((link) => link.trim())
    .filter(Boolean);
}

function isWebLink(value: string) {
  return (
    value.length <= REPORT_LINK_LENGTH_MAX && /^https?:\/\//i.test(value) && URL.canParse(value)
  );
}

// KEEP: mirrors eventReportSchema in api/src/discovery-contract.ts; the UI can't import the
// contract's zod schema, and the form needs per-field errors before submit.
export function reportFromDraft(
  draft: ReportDraft,
):
  | { report: EventReport; errors: null }
  | { report: null; errors: Record<string, ReportFieldError> } {
  const errors: Record<string, ReportFieldError> = {};
  const parsedLinks: Record<LinksId, string[]> = {
    socialLinks: links(draft.socialLinks),
    slideLinks: links(draft.slideLinks),
    mediaLinks: links(draft.mediaLinks),
  };
  for (const question of REPORT_QUESTIONS) {
    if (question.kind === "longText" && question.required && !draft[question.id].trim()) {
      errors[question.id] = "required";
    }
    if (question.kind === "links") {
      const values = parsedLinks[question.id];
      if (question.required && values.length === 0) errors[question.id] = "required";
      else if (values.length > REPORT_LINKS_MAX) errors[question.id] = "tooManyLinks";
      else if (values.some((value) => !isWebLink(value))) errors[question.id] = "invalidLink";
    }
  }
  if (!draft.format) errors.format = "required";
  if (!draft.focus) errors.focus = "required";
  if (draft.audiences.length === 0) errors.audiences = "required";
  if (draft.audiences.includes("other") && !draft.audienceOther.trim()) {
    errors.audienceOther = "required";
  }
  const attendees = Number(draft.attendees);
  if (!draft.attendees.trim()) errors.attendees = "required";
  else if (!Number.isInteger(attendees) || attendees < 0 || attendees > REPORT_ATTENDEES_MAX) {
    errors.attendees = "invalidNumber";
  }
  if (!draft.kpis[0].trim()) errors.kpi1 = "required";
  if (!draft.kpis[1].trim()) errors.kpi2 = "required";
  if (draft.hadPartners === null) errors.hadPartners = "required";
  if (draft.hadPartners && !draft.partners.trim()) errors.partners = "required";
  if (
    Object.keys(errors).length > 0 ||
    !draft.format ||
    !draft.focus ||
    draft.hadPartners === null
  ) {
    return { report: null, errors };
  }
  return {
    errors: null,
    report: {
      format: draft.format,
      focus: draft.focus,
      audiences: draft.audiences,
      audienceOther: draft.audiences.includes("other") ? draft.audienceOther.trim() : "",
      attendees,
      kpis: [draft.kpis[0].trim(), draft.kpis[1].trim(), draft.kpis[2].trim()],
      hadPartners: draft.hadPartners,
      partners: draft.hadPartners ? draft.partners.trim() : "",
      theme: draft.theme.trim(),
      wentWell: draft.wentWell.trim(),
      improvements: draft.improvements.trim(),
      talentAfter: draft.talentAfter.trim(),
      talentDuring: draft.talentDuring.trim(),
      materialsNeeded: draft.materialsNeeded.trim(),
      nextActions: draft.nextActions.trim(),
      insights: draft.insights.trim(),
      ...parsedLinks,
    },
  };
}
