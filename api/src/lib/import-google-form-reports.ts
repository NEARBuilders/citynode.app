import {
  EVENT_REPORT_AUDIENCES,
  EVENT_REPORT_FORM_VERSION,
  type EventReport,
  eventReportSchema,
} from "../discovery-contract";

export type ImportEventCandidate = {
  id: string;
  nodeId: string;
  nodeName: string;
  title: string;
  url: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
};

export type ImportReportRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type MatchedImport = {
  rowNumber: number;
  activityId: string;
  nodeId: string;
  report: EventReport;
  submittedBy: string;
  submittedAt: Date;
};

export type UnmatchedImport = {
  rowNumber: number;
  reason: string;
  values: Record<string, string>;
};

export type ImportPass = {
  matched: MatchedImport[];
  unmatched: UnmatchedImport[];
  skippedExisting: number;
};

const ACTIVITY_UUID =
  /(?:^|\/)(?:activity\/|events\/)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;
const BARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FIELD_ALIASES = {
  eventLink: ["event link", "event url", "link to the event", "event page", "url"],
  community: ["community", "community name", "city node", "city node name", "node", "node name"],
  eventName: ["event name", "event title", "title", "name of the event"],
  eventDate: ["event date", "date of the event", "date", "when was the event"],
  reporter: [
    "near account",
    "your near account",
    "account id",
    "reporter",
    "email address",
    "email",
  ],
  timestamp: ["timestamp", "submitted at"],
  format: ["irl or online", "format", "was the event irl or online"],
  socialLinks: ["links to social posts", "social links", "social posts"],
  focus: ["was the event ai or crypto focused?", "focus", "ai or crypto"],
  audiences: ["who was the target audience?", "target audience", "audiences", "audience"],
  audienceOther: ["other audience", "describe the other audience", "audience other"],
  theme: ["describe the core theme, activation and flow of the event", "theme", "core theme"],
  attendees: ["how many attendees?", "attendees", "number of attendees"],
  slideLinks: [
    "links to slides or presentation material",
    "slide links",
    "slides",
    "presentation material",
  ],
  kpi1: ["kpi 1", "kpi1", "first kpi"],
  kpi2: ["kpi 2", "kpi2", "second kpi"],
  kpi3: ["kpi 3", "kpi3", "third kpi"],
  kpis: ["kpis", "key performance indicators"],
  wentWell: ["what went well?", "went well"],
  improvements: [
    "what could have been done better? ideas for next time",
    "improvements",
    "what could have been done better?",
  ],
  talentAfter: [
    "how can we better support local talent after the event?",
    "talent after",
    "support local talent after",
  ],
  talentDuring: [
    "how can we better support talent during the event?",
    "talent during",
    "support talent during",
  ],
  materialsNeeded: [
    "any educational or support materials you need for the future?",
    "materials needed",
    "support materials",
  ],
  hadPartners: ["did local partners support this event?", "local partners", "had partners"],
  partners: ["who were the partners?", "partners", "partner names", "name the partners"],
  nextActions: ["what are your next action items?", "next actions", "next action items"],
  insights: ["any other insights or feedback?", "insights", "other feedback"],
  mediaLinks: [
    "links to photos, videos, demos or other content",
    "media links",
    "photos",
    "videos",
  ],
} as const;

type FieldKey = keyof typeof FIELD_ALIASES;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cell(row: Record<string, string>, key: FieldKey): string {
  const headers = Object.entries(row).map(
    ([header, value]) => [normalizeHeader(header), value] as const,
  );
  for (const alias of FIELD_ALIASES[key]) {
    const match = headers.find(([header]) => header === alias);
    if (match) return match[1].trim();
  }
  return "";
}

export function parseCsv(text: string): ImportReportRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((header) => header.trim());
  return rows.slice(1).map((values, index) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      if (!header) continue;
      record[header] = values[i] ?? "";
    }
    return { rowNumber: index + 2, values: record };
  });
}

function splitLinks(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBoolean(value: string): boolean | null {
  const normalized = normalizeText(value);
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

function parseFormat(value: string): EventReport["format"] | null {
  const normalized = normalizeText(value);
  if (["irl", "in person", "in-person", "offline", "presencial"].includes(normalized)) return "irl";
  if (["online", "virtual", "remote"].includes(normalized)) return "online";
  return null;
}

function parseFocus(value: string): EventReport["focus"] | null {
  const normalized = normalizeText(value);
  const hasAi = /\bai\b/.test(normalized) || normalized.includes("artificial");
  const hasCrypto =
    normalized.includes("crypto") ||
    normalized.includes("web3") ||
    normalized.includes("blockchain") ||
    /\bnear\b/.test(normalized);
  if (hasAi && hasCrypto) return null;
  if (hasAi) return "ai";
  if (hasCrypto) return "crypto";
  return null;
}

function parseAudiences(value: string): {
  audiences: EventReport["audiences"];
  audienceOther: string;
} {
  const parts = value
    .split(/[,;/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const audiences: EventReport["audiences"] = [];
  const otherParts: string[] = [];
  for (const part of parts) {
    const normalized = normalizeText(part);
    if (normalized.includes("general") || normalized.includes("public")) audiences.push("general");
    else if (normalized.includes("develop")) audiences.push("developers");
    else if (
      normalized.includes("academic") ||
      normalized.includes("universit") ||
      normalized.includes("student")
    ) {
      audiences.push("academic");
    } else if (
      normalized.includes("smb") ||
      normalized.includes("sme") ||
      normalized.includes("business")
    ) {
      audiences.push("smb");
    } else if (normalized.includes("other")) audiences.push("other");
    else otherParts.push(part);
  }
  const unique = [...new Set(audiences)].filter((audience) =>
    (EVENT_REPORT_AUDIENCES as readonly string[]).includes(audience),
  ) as EventReport["audiences"];
  if (otherParts.length === 0) return { audiences: unique, audienceOther: "" };
  if (!unique.includes("other")) unique.push("other");
  return { audiences: unique, audienceOther: otherParts.join(", ") };
}

function parseKpis(row: Record<string, string>): [string, string, string] {
  const fromParts = [cell(row, "kpi1"), cell(row, "kpi2"), cell(row, "kpi3")];
  if (fromParts.some(Boolean)) {
    return [fromParts[0] ?? "", fromParts[1] ?? "", fromParts[2] ?? ""];
  }
  const lines = cell(row, "kpis")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [lines[0] ?? "", lines[1] ?? "", lines[2] ?? ""];
}

function parseDay(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const yearPart = match[3];
    if (!yearPart) return null;
    const year = Number(yearPart.length === 2 ? `20${yearPart}` : yearPart);
    if (!month || !day || !year) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = Date.parse(`${trimmed} UTC`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function eventDay(event: ImportEventCandidate): string | null {
  const raw = event.startsAt ?? event.endsAt;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  const timeZone = event.timezone || "UTC";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parsed));
  } catch {
    return new Date(parsed).toISOString().slice(0, 10);
  }
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    if (["lu.ma", "www.lu.ma", "www.luma.com"].includes(url.hostname)) url.hostname = "luma.com";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid") url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

export function activityIdFromLink(value: string): string | null {
  const trimmed = value.trim();
  if (BARE_UUID.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(ACTIVITY_UUID);
  return match?.[1]?.toLowerCase() ?? null;
}

function matchByLink(
  link: string,
  events: readonly ImportEventCandidate[],
): { event: ImportEventCandidate } | { reason: string } | null {
  const byId = activityIdFromLink(link);
  if (byId) {
    const event = events.find((candidate) => candidate.id === byId);
    return event ? { event } : null;
  }
  const normalized = normalizeUrl(link);
  if (normalized) {
    const matches = events.filter((candidate) => normalizeUrl(candidate.url) === normalized);
    if (matches.length === 1) return { event: matches[0]! };
    if (matches.length > 1) return { reason: "event link matched more than one activity" };
    return null;
  }
  return { reason: "event link was not a usable URL" };
}

function matchByCommunityNameDate(
  row: Record<string, string>,
  events: readonly ImportEventCandidate[],
): { event: ImportEventCandidate } | { reason: string } {
  const community = cell(row, "community");
  const eventName = cell(row, "eventName");
  const eventDate = cell(row, "eventDate");
  if (!community || !eventName || !eventDate) {
    return { reason: "missing event link, or community + event name + date" };
  }
  const day = parseDay(eventDate);
  if (!day) return { reason: "event date could not be parsed" };

  const communityKey = normalizeText(community);
  const titleKey = normalizeText(eventName);
  const matches = events.filter((candidate) => {
    if (normalizeText(candidate.nodeName) !== communityKey) return false;
    if (normalizeText(candidate.title) !== titleKey) return false;
    return eventDay(candidate) === day;
  });
  if (matches.length === 1) return { event: matches[0]! };
  if (matches.length > 1) {
    return { reason: "community, event name and date matched more than one activity" };
  }
  return { reason: "community, event name and date did not match any activity" };
}

export function matchImportEvent(
  row: Record<string, string>,
  events: readonly ImportEventCandidate[],
): { event: ImportEventCandidate } | { reason: string } {
  const link = cell(row, "eventLink");
  if (!link) return matchByCommunityNameDate(row, events);

  const byLink = matchByLink(link, events);
  if (byLink && "event" in byLink) return byLink;
  if (byLink?.reason === "event link matched more than one activity") return byLink;

  const byFields = matchByCommunityNameDate(row, events);
  if ("event" in byFields) return byFields;
  if (byFields.reason !== "missing event link, or community + event name + date") return byFields;
  return byLink ?? { reason: "event link did not match any activity" };
}

export function reportFromImportRow(
  row: Record<string, string>,
): { report: EventReport } | { reason: string } {
  const format = parseFormat(cell(row, "format"));
  const focus = parseFocus(cell(row, "focus"));
  const hadPartners = parseBoolean(cell(row, "hadPartners"));
  const rawAttendees = cell(row, "attendees").replace(/,/g, "");
  const attendees = rawAttendees ? Number(rawAttendees) : Number.NaN;
  if (!format) return { reason: "format was missing or unrecognized" };
  if (!focus) return { reason: "focus was missing or unrecognized" };
  if (hadPartners === null) return { reason: "partners yes/no was missing or unrecognized" };
  if (!Number.isFinite(attendees) || attendees < 0) {
    return { reason: "attendee count was missing or invalid" };
  }

  const parsedAudiences = parseAudiences(cell(row, "audiences"));
  const audienceOther = cell(row, "audienceOther") || parsedAudiences.audienceOther;
  const kpis = parseKpis(row);
  if (!kpis[0] || !kpis[1]) {
    return { reason: "KPI 1 or 2 was missing" };
  }
  const draft = {
    format,
    socialLinks: splitLinks(cell(row, "socialLinks")),
    focus,
    audiences: parsedAudiences.audiences,
    audienceOther,
    theme: cell(row, "theme"),
    attendees: Math.trunc(attendees),
    slideLinks: splitLinks(cell(row, "slideLinks")),
    kpis,
    wentWell: cell(row, "wentWell"),
    improvements: cell(row, "improvements"),
    talentAfter: cell(row, "talentAfter"),
    talentDuring: cell(row, "talentDuring"),
    materialsNeeded: cell(row, "materialsNeeded"),
    hadPartners,
    partners: cell(row, "partners"),
    nextActions: cell(row, "nextActions"),
    insights: cell(row, "insights"),
    mediaLinks: splitLinks(cell(row, "mediaLinks")),
  };
  const parsed = eventReportSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      reason: `report fields failed validation (${parsed.error.issues[0]?.message ?? "invalid"})`,
    };
  }
  return { report: parsed.data };
}

export function resolveSubmittedBy(
  row: Record<string, string>,
  accounts: ReadonlyMap<string, string>,
  adminUserId: string,
): string {
  const reporter = cell(row, "reporter");
  if (!reporter) return adminUserId;
  return accounts.get(normalizeText(reporter)) ?? adminUserId;
}

function parseSheetsTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const us = trimmed.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp][Mm]))?)?$/,
  );
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const yearPart = us[3]!;
    const year = Number(yearPart.length === 2 ? `20${yearPart}` : yearPart);
    let hour = Number(us[4] ?? 0);
    const minute = Number(us[5] ?? 0);
    const second = Number(us[6] ?? 0);
    const ampm = us[7]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function submittedAtFromRow(row: Record<string, string>, fallback: Date): Date {
  const raw = cell(row, "timestamp");
  if (!raw) return fallback;
  return parseSheetsTimestamp(raw) ?? fallback;
}

export function planGoogleFormImport(input: {
  rows: readonly ImportReportRow[];
  events: readonly ImportEventCandidate[];
  existingActivityIds: ReadonlySet<string>;
  accounts: ReadonlyMap<string, string>;
  adminUserId: string;
  now?: Date;
}): ImportPass {
  const candidates: { row: ImportReportRow; match: MatchedImport }[] = [];
  const unmatched: UnmatchedImport[] = [];
  let skippedExisting = 0;
  const rowsByEvent = new Map<string, ImportReportRow[]>();
  const now = input.now ?? new Date();

  for (const row of input.rows) {
    const match = matchImportEvent(row.values, input.events);
    if ("reason" in match) {
      unmatched.push({ rowNumber: row.rowNumber, reason: match.reason, values: row.values });
      continue;
    }
    if (input.existingActivityIds.has(match.event.id)) {
      skippedExisting += 1;
      continue;
    }
    rowsByEvent.set(match.event.id, [...(rowsByEvent.get(match.event.id) ?? []), row]);
    const report = reportFromImportRow(row.values);
    if ("reason" in report) {
      unmatched.push({ rowNumber: row.rowNumber, reason: report.reason, values: row.values });
      continue;
    }
    candidates.push({
      row,
      match: {
        rowNumber: row.rowNumber,
        activityId: match.event.id,
        nodeId: match.event.nodeId,
        report: report.report,
        submittedBy: resolveSubmittedBy(row.values, input.accounts, input.adminUserId),
        submittedAt: submittedAtFromRow(row.values, now),
      },
    });
  }

  const matched: MatchedImport[] = [];
  for (const { row, match } of candidates) {
    const sameEvent = rowsByEvent.get(match.activityId) ?? [];
    if (sameEvent.length === 1) {
      matched.push(match);
      continue;
    }
    const rowNumbers = sameEvent.map((entry) => entry.rowNumber).join(", ");
    unmatched.push({
      rowNumber: row.rowNumber,
      reason: `rows ${rowNumbers} matched the same activity; keep one and run again`,
      values: row.values,
    });
  }
  unmatched.sort((a, b) => a.rowNumber - b.rowNumber);

  return { matched, unmatched, skippedExisting };
}

export function importReportValues(match: MatchedImport) {
  return {
    activityId: match.activityId,
    nodeId: match.nodeId,
    formVersion: EVENT_REPORT_FORM_VERSION,
    report: match.report,
    source: "import" as const,
    submittedBy: match.submittedBy,
    submittedAt: match.submittedAt,
    updatedBy: match.submittedBy,
    updatedAt: match.submittedAt,
  };
}
