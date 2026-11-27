// @vitest-environment jsdom

import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { AttendanceRecord } from "./attendance-record";

type Input = { organizationId?: string };

const harness = vi.hoisted(() => ({
  calls: [] as string[],
  getMyAttendance: (async () => ({ events: [], unclassified: [], communities: [] })) as (
    input: Input,
  ) => Promise<unknown>,
  reconcileAttendance: (async () => ({ events: 0, truncated: [], failed: [] })) as (
    input: Input,
  ) => Promise<unknown>,
  getMyCollectibles: (async () => ({ enabled: false, collectibles: [] })) as (
    input: Input,
  ) => Promise<unknown>,
}));

vi.mock("@/app", () => ({
  useApiClient: () => ({
    getMyAttendance: (input: Input) => {
      harness.calls.push(`read:${input.organizationId ?? "all"}`);
      return harness.getMyAttendance(input);
    },
    reconcileAttendance: (input: Input) => {
      harness.calls.push(`reconcile:${input.organizationId}`);
      return harness.reconcileAttendance(input);
    },
    getMyCollectibles: (input: Input) => harness.getMyCollectibles(input),
  }),
}));

const synced = {
  organizationId: "org-north",
  communityName: "North city",
  status: "synced",
  reasons: [],
  syncedAt: "2026-10-20T10:00:00.000Z",
};

function event(eventId: string, eventName: string, checkedInAt: string, communityName = "North") {
  return {
    organizationId: `org-${communityName.toLowerCase()}`,
    communityName,
    eventId,
    eventName,
    checkedInAt,
    startsAt: null as string | null,
  };
}

function show(props: Parameters<typeof AttendanceRecord>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AttendanceRecord {...props} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  harness.calls.length = 0;
  harness.getMyAttendance = async () => ({ events: [], unclassified: [], communities: [] });
  harness.reconcileAttendance = async () => ({ events: 0, truncated: [], failed: [] });
  harness.getMyCollectibles = async () => ({ enabled: false, collectibles: [] });
});

describe("AttendanceRecord", () => {
  it("shows a loading state, then the caller's events in the order the API returns", async () => {
    let resolve: (value: unknown) => void = () => {};
    harness.getMyAttendance = () => new Promise((done) => (resolve = done));
    show({ organizationId: "org-north", testId: "attendance" });
    expect(screen.getByTestId("attendance-loading")).toBeTruthy();

    resolve({
      events: [
        {
          ...event("e2", "Builders Night", "2026-10-12T23:50:00.000Z"),
          startsAt: "2026-10-12T22:00:00.000Z",
        },
        event("e1", "Builders Night", "2026-10-10T18:30:00.000Z"),
      ],
      unclassified: [],
      communities: [synced],
    });

    const rows = await screen.findAllByTestId("attendance-event");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Builders Night");
    expect(rows[0]!.textContent).toContain("Checked in on");
    expect(rows[0]!.textContent).toContain("Event date");
    expect(rows[1]!.textContent).not.toContain("Event date");
    expect(rows[0]!.textContent).not.toContain("North");
    expect(screen.getByTestId("attendance-coverage-synced").textContent).toContain("Synced up to");
  });

  it("says no check-ins are recorded only after a successful read", async () => {
    harness.getMyAttendance = async () => ({
      events: [],
      unclassified: [],
      communities: [synced],
    });
    show({ organizationId: "org-north", testId: "attendance" });
    expect((await screen.findByTestId("attendance-empty")).textContent).toBe(
      "No check-ins recorded yet.",
    );
  });

  it("shows a retryable error instead of no events when the read fails", async () => {
    harness.getMyAttendance = async () => {
      throw new Error("down");
    };
    show({ organizationId: "org-north", testId: "attendance" });
    expect((await screen.findByTestId("attendance-error")).textContent).toContain(
      "Couldn't load your events.",
    );
    expect(screen.queryByTestId("attendance-empty")).toBeNull();

    harness.getMyAttendance = async () => ({
      events: [event("e1", "Meetup", "2026-10-10T18:30:00.000Z")],
      unclassified: [],
      communities: [synced],
    });
    fireEvent.click(screen.getByTestId("attendance-retry"));
    expect(await screen.findAllByTestId("attendance-event")).toHaveLength(1);
  });

  it("explains why history may be incomplete", async () => {
    harness.getMyAttendance = async () => ({
      events: [],
      unclassified: [],
      communities: [{ ...synced, status: "incomplete", reasons: ["not_synced", "truncated"] }],
    });
    show({ organizationId: "org-north", testId: "attendance" });
    const note = await screen.findByTestId("attendance-coverage-incomplete");
    expect(note.textContent).toContain("May be incomplete.");
    expect(note.textContent).toContain("haven't been synced by an organizer");
    expect(note.textContent).toContain("check-ins may be missing");
  });

  it("lists unclassified check-ins apart from events", async () => {
    harness.getMyAttendance = async () => ({
      events: [],
      unclassified: [
        {
          organizationId: "org-north",
          communityName: "North",
          codeId: "c1",
          eventName: "Legacy sign-up",
          checkedInAt: "2026-09-01T10:00:00.000Z",
        },
      ],
      communities: [synced],
    });
    show({ organizationId: "org-north", testId: "attendance" });
    const item = await screen.findByTestId("attendance-unclassified-item");
    expect(item.textContent).toContain("Legacy sign-up");
    expect(screen.getByTestId("attendance-unclassified").textContent).toContain(
      "don't count as event attendance",
    );
    expect(screen.queryByTestId("attendance-empty")).toBeNull();
  });

  it("names each community when showing every community, and hides when there is nothing", async () => {
    harness.getMyAttendance = async () => ({
      events: [
        event("s1", "South meetup", "2026-10-20T10:00:00.000Z", "South"),
        event("n1", "North meetup", "2026-10-10T10:00:00.000Z", "North"),
      ],
      unclassified: [],
      communities: [
        { ...synced, organizationId: "org-south", communityName: "South" },
        { ...synced, status: "incomplete", reasons: ["failed"] },
      ],
    });
    show({ testId: "home" });
    const rows = await screen.findAllByTestId("home-event");
    expect(rows[0]!.textContent).toContain("South");
    expect(rows[1]!.textContent).toContain("North");
    expect(screen.getByTestId("home-coverage-incomplete").textContent).toContain("North city:");
    expect(harness.calls).toEqual(["read:all"]);
    cleanup();

    harness.getMyAttendance = async () => ({ events: [], unclassified: [], communities: [] });
    show({ testId: "home" });
    await waitFor(() => expect(harness.calls).toEqual(["read:all", "read:all"]));
    expect(screen.queryByTestId("home")).toBeNull();
    await new Promise((done) => setTimeout(done, 0));
    expect(screen.queryByTestId("home")).toBeNull();
  });

  it("keeps every community's section, with loading and empty states, when asked to", async () => {
    let resolve: (value: unknown) => void = () => {};
    harness.getMyAttendance = () => new Promise((done) => (resolve = done));
    show({ alwaysShow: true, testId: "me" });
    expect(screen.getByTestId("me-loading")).toBeTruthy();

    resolve({ events: [], unclassified: [], communities: [] });
    expect((await screen.findByTestId("me-empty")).textContent).toBe("No check-ins recorded yet.");
    expect(screen.getByTestId("me")).toBeTruthy();
  });

  it("hides itself when the caller isn't a member of the community", async () => {
    harness.getMyAttendance = async () => {
      throw new ORPCError("FORBIDDEN", { message: "You are not a member of this community" });
    };
    show({ organizationId: "org-north", testId: "attendance" });
    await waitFor(() => expect(harness.calls).toEqual(["read:org-north"]));
    await waitFor(() => expect(screen.queryByTestId("attendance")).toBeNull());
  });

  it("syncs an organizer's community before reading, and still reads when the sync fails", async () => {
    harness.reconcileAttendance = async () => {
      throw new ORPCError("FORBIDDEN");
    };
    show({ organizationId: "org-north", reconcile: true, testId: "attendance" });
    await screen.findByTestId("attendance-empty");
    expect(harness.calls).toEqual(["reconcile:org-north", "read:org-north"]);
  });

  it("reads the newly selected community when the community changes", async () => {
    harness.getMyAttendance = async (input) => ({
      events: [event("e", `${input.organizationId} event`, "2026-10-10T10:00:00.000Z")],
      unclassified: [],
      communities: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <AttendanceRecord organizationId="org-north" testId="attendance" />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId("attendance-event")).textContent).toContain(
      "org-north event",
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <AttendanceRecord organizationId="org-south" testId="attendance" />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("attendance-event").textContent).toContain("org-south event"),
    );
    expect(screen.queryByText("org-north event")).toBeNull();
  });

  it("shows View in ShardDog links for awarded badges and the state of the others", async () => {
    harness.getMyAttendance = async () => ({
      events: [
        event("e1", "Builders Night", "2026-10-12T20:00:00.000Z"),
        event("e2", "Hack Day", "2026-10-10T20:00:00.000Z"),
        event("e3", "Talks", "2026-10-08T20:00:00.000Z"),
      ],
      unclassified: [],
      communities: [synced],
    });
    harness.getMyCollectibles = async () => ({
      enabled: true,
      collectibles: [
        {
          organizationId: "org-north",
          kind: "membership",
          eventId: null,
          status: "awarded",
          viewUrl: "https://shard.dog/view/member",
        },
        {
          organizationId: "org-north",
          kind: "event",
          eventId: "e1",
          status: "awarded",
          viewUrl: "https://shard.dog/view/night",
        },
        {
          organizationId: "org-north",
          kind: "event",
          eventId: "e2",
          status: "pending",
          viewUrl: null,
        },
      ],
    });
    show({ organizationId: "org-north", testId: "attendance" });

    const membership = await screen.findByTestId("attendance-membership-collectible-view");
    expect(membership.getAttribute("href")).toBe("https://shard.dog/view/member");
    expect(screen.getByText("From your first check-in at North city")).toBeTruthy();
    const links = screen.getAllByTestId("attendance-event-collectible-view");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://shard.dog/view/night",
    ]);
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(screen.getByTestId("attendance-event-collectible-pending")).toBeTruthy();
    expect(screen.getAllByTestId("attendance-event")).toHaveLength(3);
  });

  it("checks again while a collectible is still being sent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.getMyAttendance = async () => ({
      events: [event("e1", "Builders Night", "2026-10-12T20:00:00.000Z")],
      unclassified: [],
      communities: [synced],
    });
    let reads = 0;
    harness.getMyCollectibles = async () => {
      reads += 1;
      return {
        enabled: true,
        collectibles: [
          {
            organizationId: "org-north",
            kind: "event",
            eventId: "e1",
            status: reads === 1 ? "pending" : "awarded",
            viewUrl: reads === 1 ? null : "https://shard.dog/view/night",
          },
        ],
      };
    };
    show({ organizationId: "org-north", testId: "attendance" });

    await screen.findByTestId("attendance-event-collectible-pending");
    await vi.advanceTimersByTimeAsync(5_000);
    const link = await screen.findByTestId("attendance-event-collectible-view");
    expect(link.getAttribute("href")).toBe("https://shard.dog/view/night");
  });

  it("shows no collectibles while ShardDog is off", async () => {
    harness.getMyAttendance = async () => ({
      events: [event("e1", "Builders Night", "2026-10-12T20:00:00.000Z")],
      unclassified: [],
      communities: [synced],
    });
    show({ organizationId: "org-north", testId: "attendance" });
    await screen.findByTestId("attendance-event");
    await waitFor(() =>
      expect(screen.queryByTestId("attendance-event-collectible-view")).toBeNull(),
    );
    expect(screen.queryByTestId("attendance-memberships")).toBeNull();
  });
});
