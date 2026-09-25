// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { nodeQueryKeys } from "@/lib/queries/nodes";
import { proposalReviewQueryKeys } from "@/lib/queries/proposals";
import { tenantQueryKeys } from "@/lib/queries/tenants";
import { Route } from "./apply";

type ApplyApiClient = {
  listRootNodes: ReturnType<typeof vi.fn>;
  listChildren: ReturnType<typeof vi.fn>;
  bindingPreflight: ReturnType<typeof vi.fn>;
  proposals: { propose: ReturnType<typeof vi.fn> };
};

type ApplyAuthClient = {
  organization: { list: ReturnType<typeof vi.fn> };
};

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
    runtimeConfig: {},
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
    bindingPreflight: vi.fn().mockResolvedValue({
      hostname: { available: true, format: "valid" },
    }),
    proposals: {
      propose: vi.fn().mockResolvedValue({ data: { id: "proposal-1" } }),
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
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return queryClient;
}

async function fillValidApplication() {
  fireEvent.change(screen.getByLabelText("name"), {
    target: { value: "Chicago" },
  });
  fireEvent.change(screen.getByLabelText("motivation"), {
    target: { value: "Serve the local community." },
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "submit for review" })).toBeTruthy();
  });
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
    runtimeConfig: {},
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

    await fillValidApplication();
    fireEvent.click(screen.getByRole("button", { name: "verify DAO" }));
    const submitButton = screen.getByRole("button", { name: "submit for review" });
    await waitFor(() => expect(submitButton).toHaveProperty("disabled", false));
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(harness.apiClient?.proposals.propose).toHaveBeenCalledWith({
        pluginId: "node",
        entityId: "chicago",
        payload: {
          kind: "country",
          parentId: null,
          name: "Chicago",
          slug: "chicago",
          motivation: "Serve the local community.",
          orgId: "org-1",
          accountId: "dao.sputnik",
          submitterAccountId: "applicant.near",
        },
        source: "/apply",
      }),
    );
    expect(await screen.findByText("Application submitted")).toBeTruthy();
    expect(screen.getByText("proposal-1")).toBeTruthy();
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

  it.each([
    {
      label: "missing DAO connection",
      daoConnection: { status: "idle", daoAccountId: null },
    },
    {
      label: "unverified DAO connection",
      daoConnection: { status: "connected", daoAccountId: "dao.sputnik" },
    },
  ])("keeps submission disabled with a $label", async ({ daoConnection }) => {
    harness.daoConnection = daoConnection;
    renderApply();

    await fillValidApplication();
    expect(screen.getByRole("button", { name: "submit for review" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(harness.apiClient?.proposals.propose).not.toHaveBeenCalled();
  });
});
