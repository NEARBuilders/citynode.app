export type CaseActivity = {
  kind: "event";
  status: "draft" | "published" | "cancelled";
  publishedAt: string;
  startsAt: string;
  endsAt: string;
  luma?: { available: boolean; hidden?: boolean };
};

export type EventVisibilityCase = {
  name: string;
  activity: CaseActivity;
  earlierEvents?: CaseActivity[];
  community: { tenantActive: boolean; profilePublished: boolean };
  now: string;
  expected: {
    uiState:
      | "live"
      | "scheduled"
      | "published"
      | "draft"
      | "hiddenImport"
      | "removed"
      | "cancelled"
      | "ended";
    onEventPage: boolean;
    inLists: boolean;
  };
};

const now = "2026-10-01T12:00:00.000Z";
const upcoming = {
  kind: "event",
  status: "published",
  publishedAt: "2026-09-30T12:00:00.000Z",
  startsAt: "2026-10-05T18:00:00.000Z",
  endsAt: "2026-10-05T20:00:00.000Z",
} as const;
const publicCommunity = { tenantActive: true, profilePublished: true };
const earlierUpcoming = (day: string): CaseActivity => ({
  ...upcoming,
  startsAt: `2026-10-${day}T18:00:00.000Z`,
  endsAt: `2026-10-${day}T20:00:00.000Z`,
});

export const eventVisibilityCases: EventVisibilityCase[] = [
  {
    name: "live",
    activity: upcoming,
    community: publicCommunity,
    now,
    expected: { uiState: "live", onEventPage: true, inLists: true },
  },
  {
    name: "scheduled",
    activity: { ...upcoming, publishedAt: "2026-10-02T12:00:00.000Z" },
    community: publicCommunity,
    now,
    expected: { uiState: "scheduled", onEventPage: false, inLists: false },
  },
  {
    name: "draft",
    activity: { ...upcoming, status: "draft" },
    community: publicCommunity,
    now,
    expected: { uiState: "draft", onEventPage: false, inLists: false },
  },
  {
    name: "hidden import",
    activity: { ...upcoming, status: "draft", luma: { available: true, hidden: true } },
    community: publicCommunity,
    now,
    expected: { uiState: "hiddenImport", onEventPage: false, inLists: false },
  },
  {
    name: "removed import",
    activity: { ...upcoming, status: "draft", luma: { available: false, hidden: false } },
    community: publicCommunity,
    now,
    expected: { uiState: "removed", onEventPage: false, inLists: false },
  },
  {
    name: "cancelled",
    activity: { ...upcoming, status: "cancelled" },
    community: publicCommunity,
    now,
    expected: { uiState: "cancelled", onEventPage: true, inLists: false },
  },
  {
    name: "ended",
    activity: {
      ...upcoming,
      startsAt: "2026-09-20T18:00:00.000Z",
      endsAt: "2026-09-20T20:00:00.000Z",
    },
    community: publicCommunity,
    now,
    expected: { uiState: "ended", onEventPage: true, inLists: false },
  },
  {
    name: "profile unpublished",
    activity: upcoming,
    community: { tenantActive: true, profilePublished: false },
    now,
    expected: { uiState: "published", onEventPage: false, inLists: false },
  },
  {
    name: "tenant suspended",
    activity: upcoming,
    community: { tenantActive: false, profilePublished: true },
    now,
    expected: { uiState: "published", onEventPage: false, inLists: false },
  },
  {
    name: "legacy luma without hidden",
    activity: { ...upcoming, luma: { available: true } },
    community: publicCommunity,
    now,
    expected: { uiState: "live", onEventPage: true, inLists: true },
  },
  {
    name: "fourth upcoming event",
    activity: upcoming,
    earlierEvents: [earlierUpcoming("02"), earlierUpcoming("03"), earlierUpcoming("04")],
    community: publicCommunity,
    now,
    expected: { uiState: "live", onEventPage: true, inLists: false },
  },
];
