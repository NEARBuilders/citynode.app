// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { AppI18nProvider } from "@/i18n/runtime";
import { render } from "@/i18n/test-render";
import { nodeQueryKeys } from "@/lib/queries/nodes";
import { proposalReviewQueryKeys } from "@/lib/queries/proposals";
import { tenantQueryKeys } from "@/lib/queries/tenants";
import type { NodeApplicationValues } from "./-node-application";
import { Route } from "./apply";

type ApplyApiClient = {
  listRootNodes: ReturnType<typeof vi.fn>;
  listChildren: ReturnType<typeof vi.fn>;
  getNode: ReturnType<typeof vi.fn>;
  bindingPreflight: ReturnType<typeof vi.fn>;
  auth: { checkSlug: ReturnType<typeof vi.fn> };
  proposals: { propose: ReturnType<typeof vi.fn>; getMyNodeApplications: ReturnType<typeof vi.fn> };
};

type ApplyAuthClient = {
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
  daoConnection: { status: "connected", daoAccountId: "dao.sputnik" } as {
    status: string;
    daoAccountId: string | null;
  },
  daoAccountIdForVerification: "dao.sputnik",
  nearAccount: "applicant.near" as string | null,
  initialRootNodes: [{ id: "country-1", name: "United States", kind: "country" }],
  routeContext: {
    auth: { activeOrganizationId: "org-1" as string | null },
    runtimeConfig: TEST_RUNTIME_CONFIG,
  },
  switchOrganization: { isError: false, mutate: vi.fn() },
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

vi.mock("@/components/layout/use-switch-organization", () => ({
  useSwitchOrganization: () => harness.switchOrganization,
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
      useLoaderData: () => harness.initialRootNodes,
      useRouteContext: () => harness.routeContext,
    }),
    Link: ({ children, to }: { children?: ReactNode; to?: unknown }) => (
      <a href={typeof to === "string" ? to : "#"}>{children}</a>
    ),
  };
});

function createApiClient(): ApplyApiClient {
  return {
    listRootNodes: vi.fn().mockResolvedValue(harness.initialRootNodes),
    listChildren: vi.fn().mockResolvedValue([]),
    getNode: vi.fn().mockResolvedValue(null),
    bindingPreflight: vi.fn().mockResolvedValue({
      hostname: { available: true, format: "valid" },
    }),
    auth: { checkSlug: vi.fn().mockResolvedValue({ status: true }) },
    proposals: {
      propose: vi.fn().mockResolvedValue({ data: { id: "proposal-1" } }),
      getMyNodeApplications: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
}

function createAuthClient(): ApplyAuthClient {
  return {
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

function renderApply(queryClient = createQueryClient()) {
  const Component = Route.options.component;
  if (!Component) throw new Error("Apply route has no component");
  render(
    <AppI18nProvider>
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>
    </AppI18nProvider>,
  );
  return queryClient;
}

async function fillValidApplication() {
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Chicago" },
  });
  fireEvent.change(screen.getByLabelText("Why you want to run it"), {
    target: { value: "Serve the local community." },
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeTruthy();
  });
}

function stepStatus(id: string) {
  return screen.getByTestId(`apply.step-${id}`).getAttribute("data-status");
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.apiClient = createApiClient();
  harness.authClient = createAuthClient();
  harness.activeOrganizationId = "org-1";
  harness.daoConnection = { status: "connected", daoAccountId: "dao.sputnik" };
  harness.daoAccountIdForVerification = "dao.sputnik";
  harness.nearAccount = "applicant.near";
  harness.initialRootNodes = [{ id: "country-1", name: "United States", kind: "country" }];
  harness.routeContext = {
    auth: { activeOrganizationId: "org-1" },
    runtimeConfig: TEST_RUNTIME_CONFIG,
  };
  harness.switchOrganization = { isError: false, mutate: vi.fn() };
});

afterEach(() => {
  cleanup();
  harness.apiClient = null;
  harness.authClient = null;
});

describe("apply route submission", () => {
  it("submits the validated payload, shows the proposal id, and only invalidates proposal queries", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(proposalReviewQueryKeys.list("pending"), []);
    queryClient.setQueryData(proposalReviewQueryKeys.pendingCount(), 0);
    queryClient.setQueryData(nodeQueryKeys.roots(), harness.initialRootNodes);
    queryClient.setQueryData(tenantQueryKeys.preflight("chicago.citynode.app"), {
      hostname: { available: true, format: "valid" },
    });
    renderApply(queryClient);

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
        payload: {
          kind: "city",
          parentId: null,
          name: "Chicago",
          slug: "chicago",
          motivation: "Serve the local community.",
          accountId: "dao.sputnik",
          submitterAccountId: "applicant.near",
        },
        source: "/apply",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(await screen.findByText("Your community application")).toBeTruthy();
    expect(screen.getByText("proposal-1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View application status" }).getAttribute("href")).toBe(
      "/apply",
    );
    await waitFor(() => {
      expect(
        queryClient.getQueryState(proposalReviewQueryKeys.list("pending"))?.isInvalidated,
      ).toBe(true);
      expect(queryClient.getQueryState(proposalReviewQueryKeys.pendingCount())?.isInvalidated).toBe(
        true,
      );
    });
    expect(queryClient.getQueryState(nodeQueryKeys.roots())?.isInvalidated).toBe(false);
    expect(
      queryClient.getQueryState(tenantQueryKeys.preflight("chicago.citynode.app"))?.isInvalidated,
    ).toBe(false);
  });

  it("starts as a standalone city and requires a country for a state", async () => {
    renderApply();
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await waitFor(() => expect(stepStatus("details")).toBe("current"));
    expect(screen.getByTestId("apply.kind-city").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("No country (standalone city)")).toBeTruthy();
    await fillValidApplication();
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    await waitFor(() => expect(submitButton).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByTestId("apply.kind-state"));
    await waitFor(() => expect(submitButton).toHaveProperty("disabled", true));
    expect(screen.queryByText("No country (standalone city)")).toBeNull();
  });

  it.each([
    ["pending", "not_started", "Awaiting review"],
    ["approved", "applied", "Live"],
    ["rejected", "not_started", "Rejected"],
    ["approved", "failed", "Apply failed"],
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
    renderApply();
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
    renderApply();
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
    renderApply();

    expect(stepStatus("dao")).toBe("current");
    expect(stepStatus("details")).toBe("upcoming");
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
    expect(harness.apiClient?.proposals.propose).not.toHaveBeenCalled();
  });

  it("returns to details after reopening a verified DAO step", async () => {
    renderApply();
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await waitFor(() => expect(stepStatus("details")).toBe("current"));

    fireEvent.click(screen.getByTestId("apply.step-dao-change"));
    expect(stepStatus("dao")).toBe("current");
    fireEvent.click(screen.getByTestId("apply.dao-continue"));
    expect(stepStatus("details")).toBe("current");
  });

  it("does not carry an earlier application's organization into a new application", async () => {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [
        {
          id: "existing-1",
          reviewStatus: "approved",
          applyStatus: "applied",
          rejectionReason: null,
          applySteps: {},
          applyTimedOut: false,
          appliedAt: null,
          payload: { name: "Springfield", slug: "springfield", orgId: "legacy-org" },
        },
      ],
    });
    renderApply();
    fireEvent.click(await screen.findByTestId("apply.new"));
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await fillValidApplication();
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    await waitFor(() => expect(submitButton).toHaveProperty("disabled", false));
    fireEvent.click(submitButton);

    await waitFor(() => expect(harness.apiClient?.proposals.propose).toHaveBeenCalledOnce());
    expect(harness.apiClient?.proposals.propose.mock.calls[0]?.[0].payload).not.toHaveProperty(
      "orgId",
    );
    expect(harness.apiClient?.auth.checkSlug).toHaveBeenCalledWith({ slug: "chicago" });
  });

  function rejectedApplication(payload: Partial<NodeApplicationValues>) {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [
        {
          id: "existing-1",
          reviewStatus: "rejected",
          applyStatus: "not_started",
          rejectionReason: "More detail needed",
          applySteps: {},
          applyTimedOut: false,
          appliedAt: null,
          payload: { name: "Chicago", slug: "chicago", motivation: "Serve.", ...payload },
        },
      ],
    });
  }

  it("only offers countries as the country of a new community", async () => {
    harness.initialRootNodes = [
      { id: "country-1", name: "United States", kind: "country" },
      { id: "city-root", name: "Lonely City", kind: "city" },
    ];
    rejectedApplication({ kind: "state", parentId: "city-root" });
    harness.apiClient?.getNode.mockResolvedValue({ id: "city-root", parentId: null });
    renderApply();
    fireEvent.click(await screen.findByTestId("apply.revise"));
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await waitFor(() => expect(harness.apiClient?.getNode).toHaveBeenCalled());
    expect(screen.queryByText("Lonely City")).toBeNull();
  });

  it("restores the country and state when revising a city under a state", async () => {
    rejectedApplication({ kind: "city", parentId: "state-1" });
    harness.apiClient?.getNode.mockResolvedValue({ id: "state-1", parentId: "country-1" });
    harness.apiClient?.listChildren.mockResolvedValue([
      { id: "state-1", name: "Illinois", kind: "state" },
    ]);
    renderApply();
    fireEvent.click(await screen.findByTestId("apply.revise"));
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    expect(await screen.findByText("Illinois")).toBeTruthy();
    expect(screen.getByText("United States")).toBeTruthy();
    expect(screen.queryByText("No country (standalone city)")).toBeNull();
    expect(harness.apiClient?.getNode).toHaveBeenCalledWith({ nodeId: "state-1" });
  });

  it("keeps the organization when revising a rejected legacy application", async () => {
    harness.apiClient?.proposals.getMyNodeApplications.mockResolvedValue({
      data: [
        {
          id: "existing-1",
          reviewStatus: "rejected",
          applyStatus: "not_started",
          rejectionReason: "More detail needed",
          applySteps: {},
          applyTimedOut: false,
          appliedAt: null,
          payload: {
            kind: "country",
            parentId: null,
            name: "Chicago",
            slug: "chicago",
            motivation: "Serve the local community.",
            orgId: "legacy-org",
          },
        },
      ],
    });
    harness.apiClient?.auth.checkSlug.mockResolvedValue({ status: false });
    renderApply();
    fireEvent.click(await screen.findByTestId("apply.revise"));
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    await fillValidApplication();
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    await waitFor(() => expect(submitButton).toHaveProperty("disabled", false));
    fireEvent.click(submitButton);

    await waitFor(() => expect(harness.apiClient?.proposals.propose).toHaveBeenCalledOnce());
    expect(harness.apiClient?.proposals.propose.mock.calls[0]?.[0].payload).toMatchObject({
      slug: "chicago",
      orgId: "legacy-org",
    });
  });

  it("starts with the NEAR account when there is no active organization", async () => {
    harness.routeContext = {
      auth: { activeOrganizationId: null },
      runtimeConfig: TEST_RUNTIME_CONFIG,
    };
    harness.nearAccount = null;
    renderApply();

    expect(stepStatus("near")).toBe("current");
    expect(screen.queryByTestId("apply.step-organization")).toBeNull();
    expect(await screen.findByRole("link", { name: /Link NEAR account/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "verify DAO" })).toBeNull();
  });
});
