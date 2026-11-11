// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { AppI18nProvider } from "@/i18n/runtime";
import { render } from "@/i18n/test-render";
import { proposalReviewQueryKeys } from "@/lib/queries/proposals";
import { Route } from "./apply";

type ApplyApiClient = {
  resolvePlace: ReturnType<typeof vi.fn>;
  activateCommunity: ReturnType<typeof vi.fn>;
  proposals: { propose: ReturnType<typeof vi.fn>; getMyNodeApplications: ReturnType<typeof vi.fn> };
};

type ApplyAuthClient = {
  getSession: ReturnType<typeof vi.fn>;
  organization: { list: ReturnType<typeof vi.fn> };
};

const TEST_RUNTIME_CONFIG = vi.hoisted(() => ({
  env: "development",
  account: "base.near",
  networkId: "mainnet",
  assetsUrl: "http://localhost/assets",
  apiBase: "/api",
  rpcBase: "/api/rpc",
  hostUrl: "http://localhost",
  runtime: {
    accountId: "base.near",
    gatewayId: "citynode.app",
    runtimeBasePath: "/",
    title: "City Nodes",
    description: "",
    hostUrl: "http://localhost",
  },
}));

const harness = vi.hoisted(() => ({
  apiClient: null as ApplyApiClient | null,
  authClient: null as ApplyAuthClient | null,
  activeOrganizationId: "org-1" as string | null,
  sessionActiveOrganizationId: "org-1" as string | null,
  daoConnection: { status: "connected", daoAccountId: "dao.sputnik" } as {
    status: string;
    daoAccountId: string | null;
  },
  daoAccountIdForVerification: "dao.sputnik",
  nearAccount: "applicant.near" as string | null,
  search: {} as { application?: string },
  routeContext: {
    auth: { activeOrganizationId: "org-1" as string | null },
    runtimeConfig: TEST_RUNTIME_CONFIG,
  },
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app", async () => {
  const actual = await vi.importActual<typeof import("@/app")>("@/app");
  return {
    ...actual,
    getActiveRuntime: () => ({ gatewayId: "citynode.app" }),
    useApiClient: () => harness.apiClient,
    useAuthClient: () => harness.authClient,
  };
});

vi.mock("@/components/connect-dao", () => ({
  ConnectDao: ({ onVerified }: { onVerified?: (value: { daoAccountId: string }) => void }) => (
    <Button
      type="button"
      onClick={() => onVerified?.({ daoAccountId: harness.daoAccountIdForVerification })}
    >
      verify DAO
    </Button>
  ),
}));

vi.mock("./-apply-place-fields", () => ({
  ApplyPlaceFields: ({ onPathChange }: { onPathChange: (path: unknown[]) => void }) => (
    <Button
      type="button"
      onClick={() =>
        onPathChange([
          { id: "11111111-1111-4111-8111-111111111111", slug: "united-states", name: "USA" },
          { id: "22222222-2222-4222-8222-222222222222", slug: "chicago", name: "Chicago" },
        ])
      }
    >
      choose Chicago
    </Button>
  ),
}));

vi.mock("@/lib/dao-connect", () => ({
  useDaoConnection: () => harness.daoConnection,
}));

vi.mock("@/lib/use-near-account", () => ({
  useNearAccount: () => harness.nearAccount,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => harness.success(...args),
    warning: (...args: unknown[]) => harness.warning(...args),
    error: (...args: unknown[]) => harness.error(...args),
  },
}));

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: () => (options: { component?: ComponentType }) => ({
      options,
      useRouteContext: () => harness.routeContext,
      useSearch: () => harness.search,
    }),
    Link: ({ children, to }: { children?: ReactNode; to?: unknown }) => (
      <a href={typeof to === "string" ? to : "#"}>{children}</a>
    ),
  };
});

function createApiClient(): ApplyApiClient {
  return {
    resolvePlace: vi.fn().mockResolvedValue({
      place: { id: "22222222-2222-4222-8222-222222222222", slug: "chicago", name: "Chicago" },
      aliases: [],
      community: { nodeId: "node-1", activatedAt: null, memberCount: 3 },
    }),
    activateCommunity: vi.fn().mockResolvedValue({ placeId: "p", slug: "chicago" }),
    proposals: {
      propose: vi.fn().mockResolvedValue({ data: { id: "proposal-1" } }),
      getMyNodeApplications: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
}

function createAuthClient(): ApplyAuthClient {
  return {
    getSession: vi.fn(async () => ({
      data: {
        user: { id: "user-1" },
        session: { activeOrganizationId: harness.sessionActiveOrganizationId },
      },
      error: null,
    })),
    organization: {
      list: vi.fn().mockResolvedValue({
        data: [{ id: "org-1", name: "CityNode" }],
        error: null,
      }),
    },
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

async function renderApply(queryClient = createQueryClient()) {
  const Component = Route.options.component;
  if (!Component) throw new Error("Apply route has no component");
  render(
    <AppI18nProvider>
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>
    </AppI18nProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId("apply.loading")).toBeNull());
  return queryClient;
}

async function fillValidApplication() {
  fireEvent.click(screen.getByRole("button", { name: "choose Chicago" }));
  fireEvent.change(screen.getByLabelText("Why you want to run it"), {
    target: { value: "Serve the local community." },
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeTruthy();
  });
}

const chicagoPayload = {
  placeId: "22222222-2222-4222-8222-222222222222",
  name: "Chicago",
  slug: "chicago",
  motivation: "Serve the local community.",
  accountId: "dao.sputnik",
  submitterAccountId: "applicant.near",
};

function stepStatus(id: string) {
  return screen.getByTestId(`apply.step-${id}`).getAttribute("data-status");
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.apiClient = createApiClient();
  harness.authClient = createAuthClient();
  harness.activeOrganizationId = "org-1";
  harness.sessionActiveOrganizationId = "org-1";
  harness.daoConnection = { status: "connected", daoAccountId: "dao.sputnik" };
  harness.daoAccountIdForVerification = "dao.sputnik";
  harness.nearAccount = "applicant.near";
  harness.search = {};
  harness.routeContext = {
    auth: { activeOrganizationId: "org-1" },
    runtimeConfig: TEST_RUNTIME_CONFIG,
  };
});

afterEach(() => {
  cleanup();
  harness.apiClient = null;
  harness.authClient = null;
});

describe("apply route submission", () => {
  it("submits an Official Application for an active community without activating it again", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(proposalReviewQueryKeys.list("pending"), []);
    queryClient.setQueryData(proposalReviewQueryKeys.pendingCount(), 0);
    await renderApply(queryClient);

    expect(stepStatus("near")).toBe("complete");
    expect(stepStatus("dao")).toBe("current");
    expect(stepStatus("details")).toBe("upcoming");
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await waitFor(() => expect(stepStatus("details")).toBe("current"));
    expect(stepStatus("dao")).toBe("complete");
    await fillValidApplication();
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    await waitFor(() => expect(submitButton).toHaveProperty("disabled", false));
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(harness.apiClient?.proposals.propose).toHaveBeenCalledWith({
        pluginId: "node",
        entityId: "chicago",
        payload: chicagoPayload,
        source: "/apply",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(harness.apiClient?.activateCommunity).not.toHaveBeenCalled();
    expect(await screen.findByText("Your Official Application")).toBeTruthy();
    expect(screen.getByText("proposal-1")).toBeTruthy();
    await waitFor(() => {
      expect(
        queryClient.getQueryState(proposalReviewQueryKeys.list("pending"))?.isInvalidated,
      ).toBe(true);
    });
  });

  it("activates the place first when it has no community yet", async () => {
    harness.apiClient?.resolvePlace.mockResolvedValue({
      place: { id: "22222222-2222-4222-8222-222222222222", slug: "chicago", name: "Chicago" },
      aliases: [],
      community: null,
    });
    await renderApply();
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await waitFor(() => expect(stepStatus("details")).toBe("current"));
    await fillValidApplication();
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    await waitFor(() => expect(submitButton).toHaveProperty("disabled", false));
    fireEvent.click(submitButton);

    await waitFor(() => expect(harness.apiClient?.proposals.propose).toHaveBeenCalled());
    expect(harness.apiClient?.activateCommunity).toHaveBeenCalledWith({ place: "chicago" });
    expect(harness.apiClient?.activateCommunity.mock.invocationCallOrder[0]).toBeLessThan(
      harness.apiClient?.proposals.propose.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("keeps submit disabled until a place is chosen", async () => {
    await renderApply();
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await waitFor(() => expect(stepStatus("details")).toBe("current"));
    fireEvent.change(screen.getByLabelText("Why you want to run it"), {
      target: { value: "Serve the local community." },
    });
    expect(screen.getByRole("button", { name: "Submit for review" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it.each([
    ["pending", "not_started", "Awaiting review"],
    ["approved", "applying", "Applying"],
    ["rejected", "not_started", "Rejected"],
    ["approved", "failed", "Apply failed"],
    ["removed", "not_started", "Removed"],
  ])("shows %s/%s application status after reload", async (reviewStatus, applyStatus, expected) => {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [
        {
          id: "existing-1",
          reviewStatus,
          applyStatus,
          rejectionReason: reviewStatus === "rejected" ? "More detail needed" : null,
          applySteps: {},
          applyTimedOut: false,
          appliedAt: null,
          payload: { name: "Chicago" },
        },
      ],
    });
    await renderApply();
    expect((await screen.findByTestId("apply.current-status")).textContent).toBe(expected);
    expect(screen.getByText("existing-1")).toBeTruthy();
    expect(screen.queryByTestId("apply.submit")).toBeNull();
    expect(screen.queryByTestId("apply.progress") !== null).toBe(reviewStatus === "approved");
    if (reviewStatus === "rejected") {
      expect(screen.getByText("More detail needed")).toBeTruthy();
      fireEvent.click(screen.getByTestId("apply.revise"));
      expect(screen.getByTestId("apply.steps")).toBeTruthy();
    }
  });

  const application = (
    id: string,
    reviewStatus: string,
    applyStatus: string,
    createdAt: string,
  ) => ({
    id,
    reviewStatus,
    applyStatus,
    rejectionReason: null,
    applySteps: {},
    applyTimedOut: false,
    appliedAt: null,
    createdAt,
    payload: { name: id },
  });

  it("opens a fresh form when the latest application is live", async () => {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [application("live-1", "approved", "applied", "2026-09-10T00:00:00.000Z")],
    });
    await renderApply();
    expect(screen.getByTestId("apply.steps")).toBeTruthy();
    expect(screen.queryByTestId("apply.submitted")).toBeNull();
  });

  it("picks the latest application by submission time, not last update", async () => {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [
        application("live-1", "approved", "applied", "2026-09-01T00:00:00.000Z"),
        application("pending-2", "pending", "not_started", "2026-09-10T00:00:00.000Z"),
      ],
    });
    await renderApply();
    expect((await screen.findByTestId("apply.current-status")).textContent).toBe("Awaiting review");
    expect(screen.getByText("pending-2", { selector: "p.font-mono" })).toBeTruthy();
  });

  it("does not let an older rejected application hide a newer live one", async () => {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [
        application("rejected-1", "rejected", "not_started", "2026-09-01T00:00:00.000Z"),
        application("live-2", "approved", "applied", "2026-09-10T00:00:00.000Z"),
      ],
    });
    await renderApply();
    expect(screen.getByTestId("apply.steps")).toBeTruthy();
  });

  it("shows a live application's status when opened from its status link", async () => {
    harness.search = { application: "live-1" };
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [application("live-1", "approved", "applied", "2026-09-10T00:00:00.000Z")],
    });
    await renderApply();
    expect((await screen.findByTestId("apply.current-status")).textContent).toBe("Live");
    fireEvent.click(screen.getByTestId("apply.new"));
    expect(screen.getByTestId("apply.steps")).toBeTruthy();
  });

  it("waits for the applicant's applications before showing the form", async () => {
    harness.apiClient?.proposals.getMyNodeApplications.mockReturnValue(new Promise(() => {}));
    const queryClient = createQueryClient();
    const Component = Route.options.component;
    if (!Component) throw new Error("Apply route has no component");
    render(
      <AppI18nProvider>
        <QueryClientProvider client={queryClient}>
          <Component />
        </QueryClientProvider>
      </AppI18nProvider>,
    );
    expect(screen.getByTestId("apply.loading")).toBeTruthy();
    expect(screen.queryByTestId("apply.steps")).toBeNull();
  });

  it("shows the applicant which setup step is waiting on their DAO", async () => {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [
        {
          id: "existing-1",
          reviewStatus: "approved",
          applyStatus: "failed",
          rejectionReason: null,
          applyTimedOut: false,
          appliedAt: null,
          applySteps: {
            organization: {
              status: "completed",
              resourceId: "org",
              recordedAt: "2026-09-10T00:01:00.000Z",
            },
            community: {
              status: "completed",
              resourceId: "node",
              recordedAt: "2026-09-10T00:02:00.000Z",
            },
            publication: {
              status: "waiting",
              resourceId: "12",
              recordedAt: "2026-09-10T00:03:00.000Z",
            },
          },
          payload: { name: "Chicago", accountId: "chicago.sputnik-dao.near" },
        },
      ],
    });
    await renderApply();
    const publication = await screen.findByTestId("application-progress-publication");
    expect(publication.getAttribute("data-state")).toBe("waiting");
    expect(screen.getByTestId("application-progress-community").getAttribute("data-state")).toBe(
      "done",
    );
    expect(screen.queryByText("node")).toBeNull();
    expect(screen.getByTestId("application-progress-dao-vote").getAttribute("href")).toBe(
      "https://trezu.app/chicago.sputnik-dao.near/requests",
    );
  });

  it.each([
    {
      label: "missing DAO connection",
      daoConnection: { status: "idle", daoAccountId: null },
    },
    {
      label: "unverified DAO connection",
      daoConnection: { status: "connected", daoAccountId: "dao.sputnik" },
    },
  ])("keeps the details step locked with a $label", async ({ daoConnection }) => {
    harness.daoConnection = daoConnection;
    await renderApply();

    expect(stepStatus("dao")).toBe("current");
    expect(stepStatus("details")).toBe("upcoming");
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
    expect(harness.apiClient?.proposals.propose).not.toHaveBeenCalled();
  });

  it("returns to details after reopening a verified DAO step", async () => {
    await renderApply();
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await waitFor(() => expect(stepStatus("details")).toBe("current"));

    fireEvent.click(screen.getByTestId("apply.step-dao-change"));
    expect(stepStatus("dao")).toBe("current");
    fireEvent.click(screen.getByTestId("apply.dao-continue"));
    expect(stepStatus("details")).toBe("current");
  });
});
