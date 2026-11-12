// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route } from "./report";

const NODE = "node-1";
const ACTIVITY = "activity-1";
const ORG = "org-1";

const harness = vi.hoisted(() => ({
  activities: [] as unknown[],
  report: null as unknown,
  canEdit: true,
  canReview: false,
  reviewed: [] as unknown[],
  node: Promise.resolve({ tenantId: "tenant-1" }) as Promise<unknown>,
  tenant: Promise.resolve({ orgId: "org-1" }) as Promise<unknown>,
  codes: Promise.resolve([]) as Promise<Array<{ usedCount: number }>>,
  calls: { node: 0, tenant: 0, codes: 0 },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    ...options,
    useParams: () => ({ nodeId: NODE, activityId: ACTIVITY }),
    useRouteContext: () => ({ auth: { activeOrganizationId: ORG } }),
  }),
  Link: ({ children }: { children?: ReactNode }) => <a href="/events">{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/app", () => ({
  useApiClient: () => ({
    listDiscoveryActivities: async () => harness.activities,
    getEventReport: async () => ({
      report: harness.report,
      canEdit: harness.canEdit,
      canReview: harness.canReview,
    }),
    reviewEventReport: async (input: unknown) => {
      harness.reviewed.push(input);
      return { reviewedAt: "2026-10-20T00:00:00.000Z" };
    },
    getNode: () => {
      harness.calls.node += 1;
      return harness.node;
    },
    resolveTenantById: () => {
      harness.calls.tenant += 1;
      return harness.tenant;
    },
    auth: {
      listOnboardingCodes: () => {
        harness.calls.codes += 1;
        return harness.codes;
      },
    },
  }),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function attendees() {
  return (screen.getByTestId("report-attendees") as HTMLInputElement).value;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = (Route as unknown as { component: ComponentType }).component;
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

const activity = {
  id: ACTIVITY,
  title: "Harbor Launch Night",
  startsAt: "2026-10-15T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  harness.canEdit = true;
  harness.canReview = false;
  harness.reviewed.length = 0;
});

const savedReport = {
  activityId: ACTIVITY,
  formVersion: 1,
  submittedAt: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
  reviewedAt: null as string | null,
  report: {
    format: "irl",
    socialLinks: ["https://example.com/post"],
    focus: "crypto",
    audiences: ["general"],
    audienceOther: "",
    theme: "Launch notes",
    attendees: 12,
    slideLinks: [],
    kpis: ["Twelve people", "Two new members", ""],
    wentWell: "The room stayed for the demo.",
    improvements: "Start on time.",
    talentAfter: "Two people offered to host.",
    talentDuring: "A member ran check-in.",
    materialsNeeded: "",
    hadPartners: false,
    partners: "",
    nextActions: "Publish the notes.",
    insights: "",
    mediaLinks: [],
  },
};

describe("event report check-in prefill", () => {
  it("waits for check-ins before showing a new report", async () => {
    const node = deferred<{ tenantId: string }>();
    const tenant = deferred<{ orgId: string }>();
    const codes = deferred<Array<{ usedCount: number }>>();
    harness.activities = [activity];
    harness.report = null;
    harness.node = node.promise;
    harness.tenant = tenant.promise;
    harness.codes = codes.promise;
    harness.calls = { node: 0, tenant: 0, codes: 0 };

    renderPage();

    await waitFor(() => expect(harness.calls.node).toBe(1));
    expect(screen.queryByTestId("report-attendees")).toBeNull();

    node.resolve({ tenantId: "tenant-1" });
    await waitFor(() => expect(harness.calls.tenant).toBe(1));
    expect(screen.queryByTestId("report-attendees")).toBeNull();

    tenant.resolve({ orgId: ORG });
    await waitFor(() => expect(harness.calls.codes).toBe(1));
    expect(screen.queryByTestId("report-attendees")).toBeNull();

    codes.resolve([{ usedCount: 4 }, { usedCount: 3 }]);
    await waitFor(() => expect(attendees()).toBe("7"));
  });

  it("shows an empty attendee count when check-ins belong to another community", async () => {
    harness.activities = [activity];
    harness.report = null;
    harness.node = Promise.resolve({ tenantId: "tenant-1" });
    harness.tenant = Promise.resolve({ orgId: "other-org" });
    harness.codes = new Promise(() => {});

    renderPage();

    await waitFor(() => expect(attendees()).toBe(""));
  });

  it("shows a saved report without waiting for check-ins", async () => {
    harness.activities = [activity];
    harness.report = savedReport;
    harness.node = new Promise(() => {});
    harness.tenant = new Promise(() => {});
    harness.codes = new Promise(() => {});

    renderPage();

    await waitFor(() => expect(attendees()).toBe("12"));
  });

  it("shows a platform admin the answers without the form", async () => {
    harness.activities = [activity];
    harness.report = savedReport;
    harness.canEdit = false;
    harness.node = new Promise(() => {});
    harness.tenant = new Promise(() => {});
    harness.codes = new Promise(() => {});

    renderPage();

    expect(await screen.findByTestId("report-answers")).toBeTruthy();
    expect(screen.getByText("Launch notes")).toBeTruthy();
    expect(screen.queryByTestId("report-attendees")).toBeNull();
  });

  it("lets a platform admin mark the report reviewed", async () => {
    harness.activities = [activity];
    harness.report = savedReport;
    harness.canEdit = false;
    harness.canReview = true;

    renderPage();

    fireEvent.click(await screen.findByTestId("report.review"));
    await waitFor(() =>
      expect(harness.reviewed).toEqual([{ activityId: ACTIVITY, reviewed: true }]),
    );
  });

  it("tells the organizer their report was reviewed", async () => {
    harness.activities = [activity];
    harness.report = { ...savedReport, reviewedAt: "2026-10-20T00:00:00.000Z" };

    renderPage();

    expect((await screen.findByTestId("report.reviewed-on")).textContent).toContain("Reviewed");
    expect(screen.queryByTestId("report.review")).toBeNull();
  });
});
