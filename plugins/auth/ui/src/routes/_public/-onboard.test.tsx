// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route as OnboardRoute } from "./onboard";

const harness = vi.hoisted(() => ({
  session: null as { user: { id: string; name: string } } | null,
  sessionGate: null as Promise<never> | null,
  getOnboardingCodeInfo: vi.fn(),
  redeemOnboardingCode: vi.fn(),
  resolveTenantByOrgId: vi.fn(),
  listNodes: vi.fn(),
  getDiscoveryNode: vi.fn(),
  clipboardWriteText: vi.fn(async () => undefined),
}));

vi.mock("everything-dev/ui/auth", () => ({
  sessionQueryOptions: () => ({
    queryKey: ["session"],
    queryFn: async () => {
      await harness.sessionGate;
      return harness.session;
    },
  }),
  refreshSessionCache: vi.fn(async () => harness.session),
  createAccountWithPasskey: vi.fn(),
  signInWithPasskey: vi.fn(),
  isUnsupportedAuthenticatorError: () => false,
  useAuthClient: () => ({
    near: { detectNearAccount: async () => null },
    updateUser: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("better-near-auth/client", () => ({ isPasskeyWalletAvailable: () => true }));

const CODE = "valid-code-12345";
const joined = {
  organizationId: "org-1",
  organizationName: "Chicago Builders",
  eventName: "Launch Night",
};

const info = {
  organizationName: "Chicago Builders",
  eventName: "Launch Night",
  inviterName: "Ada",
  revoked: false,
  expired: false,
  usedUp: false,
};

function renderOnboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRouteWithContext<Record<string, unknown>>()({ component: Outlet });
  const onboardRoute = OnboardRoute.update({
    ...OnboardRoute.options,
    getParentRoute: () => root,
    path: "/onboard",
    id: undefined,
  } as never);
  const router = createRouter({
    routeTree: root.addChildren([onboardRoute as never]),
    history: createMemoryHistory({ initialEntries: [`/onboard?code=${CODE}`] }),
    context: {
      queryClient,
      apiClient: {
        auth: {
          getOnboardingCodeInfo: harness.getOnboardingCodeInfo,
          redeemOnboardingCode: harness.redeemOnboardingCode,
        },
        resolveTenantByOrgId: harness.resolveTenantByOrgId,
        listNodes: harness.listNodes,
        getDiscoveryNode: harness.getDiscoveryNode,
      },
      runtimeConfig: { networkId: "mainnet", runtime: { gatewayId: "citynode.app" } },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  harness.resolveTenantByOrgId.mockRejectedValue(new Error("NOT_FOUND"));
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: harness.clipboardWriteText },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  harness.session = null;
  harness.sessionGate = null;
});

describe("onboard join flow", () => {
  it("invites a signed-out visitor at step 1 with account creation first", async () => {
    harness.getOnboardingCodeInfo.mockResolvedValue(info);

    renderOnboard();

    const invite = await screen.findByTestId("onboard.invite");
    expect(invite.textContent).toContain("Chicago Builders");
    expect(invite.textContent).toContain("Launch Night");
    expect(screen.getByTestId("onboard.progress").getAttribute("data-step")).toBe("1");
    expect(screen.getByTestId("onboard.create-account-button")).toBeTruthy();
    expect(harness.redeemOnboardingCode).not.toHaveBeenCalled();
  });

  it("asks an unnamed returning member for a name, then shows the done state", async () => {
    harness.session = { user: { id: "user-1", name: "Passkey user" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    renderOnboard();

    await waitFor(() => expect(harness.redeemOnboardingCode).toHaveBeenCalledWith({ code: CODE }));
    expect(await screen.findByTestId("onboard.display-name")).toBeTruthy();
    expect(screen.getByTestId("onboard.progress").getAttribute("data-step")).toBe("3");
    expect(screen.getByTestId("onboard.success").textContent).toContain("Chicago Builders");

    fireEvent.click(screen.getByTestId("onboard.display-name-skip"));

    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
    expect(screen.getByTestId("onboard.gateway-origin").textContent).toBe(
      "localhost:3000/login?method=phone",
    );
    expect(screen.queryByTestId("onboard.display-name")).toBeNull();
  });

  it("skips the name step for a returning member who already chose a name", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    renderOnboard();

    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
    expect(screen.queryByTestId("onboard.display-name")).toBeNull();
  });

  it("points the done state at the community the attendee just joined", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    renderOnboard();

    const communityButton = await screen.findByTestId("onboard.community-button");
    expect(communityButton.getAttribute("href")).toBe("/dashboard/node");
    expect(communityButton.textContent).toContain("Chicago Builders");
  });

  it("shows a returning member the joined state for a code that has since expired", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, expired: true });
    let resolveRedeem: (value: unknown) => void = () => undefined;
    harness.redeemOnboardingCode.mockReturnValue(
      new Promise((resolve) => {
        resolveRedeem = resolve;
      }),
    );

    renderOnboard();

    await waitFor(() => expect(harness.redeemOnboardingCode).toHaveBeenCalledWith({ code: CODE }));
    expect(screen.getByTestId("onboard.loading")).toBeTruthy();
    expect(screen.queryByTestId("onboard.unavailable")).toBeNull();

    resolveRedeem({ ...joined, organizationName: "Example Community" });

    expect(await screen.findByTestId("onboard.success")).toBeTruthy();
    expect(screen.queryByTestId("onboard.unavailable")).toBeNull();
  });

  it("shows a signed-in visitor who never joined that a used-up code is unavailable", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, usedUp: true });
    harness.redeemOnboardingCode.mockRejectedValue(new Error("reached its limit"));

    renderOnboard();

    expect((await screen.findByTestId("onboard.unavailable")).textContent).toBeTruthy();
    expect(screen.queryByTestId("onboard.error")).toBeNull();
  });

  it("keeps a revoked code unavailable without waiting on the join", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, revoked: true });
    harness.redeemOnboardingCode.mockReturnValue(new Promise(() => undefined));

    renderOnboard();

    expect(await screen.findByTestId("onboard.unavailable")).toBeTruthy();
  });

  it("keeps an expired code on loading until the session is known", async () => {
    harness.sessionGate = new Promise(() => undefined);
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, expired: true });

    renderOnboard();

    await expect(
      screen.findByTestId("onboard.unavailable", undefined, { timeout: 300 }),
    ).rejects.toThrow();
    expect(screen.getByTestId("onboard.loading")).toBeTruthy();
  });

  it("shows a signed-out visitor that an expired code is unavailable", async () => {
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, expired: true });

    renderOnboard();

    expect(await screen.findByTestId("onboard.unavailable")).toBeTruthy();
    expect(harness.redeemOnboardingCode).not.toHaveBeenCalled();
  });

  it("copies the desktop pairing link from the continue card", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    renderOnboard();

    fireEvent.click(await screen.findByTestId("onboard.continue-copy-link"));

    await waitFor(() =>
      expect(harness.clipboardWriteText).toHaveBeenCalledWith(
        "http://localhost:3000/login?method=phone",
      ),
    );
  });
});

describe("onboard community link", () => {
  function joinAsNamedMember() {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);
  }

  function communityWithNodes(nodes: unknown[]) {
    harness.resolveTenantByOrgId.mockResolvedValue({ id: "tenant-1" });
    harness.listNodes.mockResolvedValue(nodes);
    harness.getDiscoveryNode.mockResolvedValue({ id: "node-a" });
  }

  it("links to the community's public page below the primary build button", async () => {
    joinAsNamedMember();
    communityWithNodes([{ id: "node-a", slug: "chicago", name: "Chicago", parentId: null }]);

    renderOnboard();

    const link = await screen.findByTestId("onboard.community-link");
    expect(link.getAttribute("href")).toBe("/n/chicago");
    expect(link.textContent).toContain("See Chicago Builders");
    expect(harness.resolveTenantByOrgId).toHaveBeenCalledWith({ orgId: "org-1" });
    expect(harness.listNodes).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    const build = screen.getByTestId("onboard.build-button");
    expect(build.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses the node My community opens first and keeps its parent", async () => {
    joinAsNamedMember();
    communityWithNodes([
      { id: "node-z", slug: "zeta", name: "Zeta", parentId: null },
      { id: "node-a", slug: "alpha", name: "Alpha", parentId: "parent-1" },
    ]);

    renderOnboard();

    const link = await screen.findByTestId("onboard.community-link");
    expect(link.getAttribute("href")).toBe("/n/alpha?parentId=parent-1");
    expect(harness.getDiscoveryNode).toHaveBeenCalledWith({ nodeId: "node-a" });
  });

  type Lookup = "resolveTenantByOrgId" | "listNodes" | "getDiscoveryNode";
  const failures: Array<[string, Lookup, () => void]> = [
    ["the organization has no tenant", "resolveTenantByOrgId", () => undefined],
    ["the tenant has no nodes", "listNodes", () => communityWithNodes([])],
    [
      "the community has no public page",
      "getDiscoveryNode",
      () => {
        communityWithNodes([{ id: "node-a", slug: "chicago", name: "Chicago", parentId: null }]);
        harness.getDiscoveryNode.mockResolvedValue(null);
      },
    ],
    [
      "a lookup fails on the network",
      "listNodes",
      () => {
        communityWithNodes([{ id: "node-a", slug: "chicago", name: "Chicago", parentId: null }]);
        harness.listNodes.mockRejectedValue(new TypeError("Failed to fetch"));
      },
    ],
    [
      "the node My community opens comes back without a slug",
      "listNodes",
      () =>
        communityWithNodes([
          { id: "node-a", name: "Alpha", parentId: null },
          { id: "node-b", slug: "beta", name: "Beta", parentId: null },
        ]),
    ],
  ];

  it.each(failures)("shows no link and no error when %s", async (_case, lastLookup, arrange) => {
    joinAsNamedMember();
    arrange();

    renderOnboard();

    expect(await screen.findByTestId("onboard.build-button")).toBeTruthy();
    const lookup = harness[lastLookup];
    await waitFor(() => expect(lookup).toHaveBeenCalled());
    await act(async () => {
      await Promise.allSettled(lookup.mock.results.map((result) => result.value));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByTestId("onboard.community-link")).toBeNull();
    expect(harness.getDiscoveryNode.mock.calls.length > 0).toBe(lastLookup === "getDiscoveryNode");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("onboard.success")).toBeTruthy();
    expect(screen.getByTestId("onboard.continue-on-computer")).toBeTruthy();
    expect(screen.getByTestId("onboard.home-button")).toBeTruthy();
  });
});
