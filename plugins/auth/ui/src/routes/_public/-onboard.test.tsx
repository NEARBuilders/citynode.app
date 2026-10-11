// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
  detectNearAccount: vi.fn(async () => null as { accountId?: string | null } | null),
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
    near: { detectNearAccount: harness.detectNearAccount },
    updateUser: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("better-near-auth/client", () => ({ isPasskeyWalletAvailable: () => true }));

const CODE = "valid-code-12345";
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
  harness.detectNearAccount.mockResolvedValue(null);
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
    harness.redeemOnboardingCode.mockResolvedValue({
      organizationName: "Chicago Builders",
      eventName: "Launch Night",
    });

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
    harness.redeemOnboardingCode.mockResolvedValue({
      organizationName: "Chicago Builders",
      eventName: "Launch Night",
    });

    renderOnboard();

    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
    expect(screen.queryByTestId("onboard.display-name")).toBeNull();
  });

  it("points the done state at the build page", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue({
      organizationName: "Chicago Builders",
      eventName: "Launch Night",
    });

    renderOnboard();

    const buildButton = await screen.findByTestId("onboard.build-button");
    expect(buildButton.getAttribute("href")).toBe("/build");
    expect(screen.queryByTestId("build.prompts")).toBeNull();
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

    resolveRedeem({ organizationName: "Example Community", eventName: "Launch Night" });

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
    harness.redeemOnboardingCode.mockResolvedValue({
      organizationName: "Chicago Builders",
      eventName: "Launch Night",
    });

    renderOnboard();

    fireEvent.click(await screen.findByTestId("onboard.continue-copy-link"));

    await waitFor(() =>
      expect(harness.clipboardWriteText).toHaveBeenCalledWith(
        "http://localhost:3000/login?method=phone",
      ),
    );
  });

  it("shows Retry when the invitation lookup fails instead of spinning", async () => {
    harness.getOnboardingCodeInfo.mockRejectedValue(new Error("offline"));

    renderOnboard();

    expect(await screen.findByText("Couldn't load this invitation")).toBeTruthy();
    expect(screen.getByTestId("onboard.retry-button")).toBeTruthy();
    expect(screen.queryByTestId("onboard.loading")).toBeNull();
  });

  it("retries a failed invitation lookup", async () => {
    harness.getOnboardingCodeInfo
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(info);

    renderOnboard();
    fireEvent.click(await screen.findByTestId("onboard.retry-button"));

    expect(await screen.findByTestId("onboard.invite")).toBeTruthy();
  });

  it("does not throw when the NEAR account check fails", async () => {
    harness.detectNearAccount.mockRejectedValue(new Error("rpc down"));
    harness.getOnboardingCodeInfo.mockResolvedValue(info);

    renderOnboard();

    expect(await screen.findByTestId("onboard.invite")).toBeTruthy();
  });

  it("retries a network failure while joining instead of asking for a new link", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue({
        organizationName: "Chicago Builders",
        eventName: "Launch Night",
      });

    renderOnboard();

    expect(await screen.findByText("Couldn't join right now")).toBeTruthy();
    expect(screen.getByTestId("onboard.retry-button")).toBeTruthy();
    expect(screen.queryByText("Ask the organizer for a new link")).toBeNull();

    fireEvent.click(screen.getByTestId("onboard.retry-button"));
    expect(await screen.findByTestId("onboard.success")).toBeTruthy();
  });

  it.each([
    ["organization_not_active", "This community isn't open yet", "onboard.explore-button"],
    ["organization_full", "This community is full", "onboard.explore-button"],
    ["code_revoked", "This invitation was turned off", null],
    ["code_expired", "This invitation has expired", null],
    ["code_used_up", "This invitation has been used up", null],
    ["code_not_found", "This invitation isn't valid", null],
    ["organization_not_found", "This invitation isn't valid", null],
  ] as const)("shows %s with its next step", async (reason, title, actionTestId) => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockRejectedValue({ data: { reason } });

    renderOnboard();

    expect(await screen.findByText(title)).toBeTruthy();
    if (actionTestId) {
      expect(screen.getByTestId(actionTestId)).toBeTruthy();
      expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
    } else {
      expect(screen.getByText("Ask the organizer for a new link")).toBeTruthy();
      expect(screen.queryByTestId("onboard.explore-button")).toBeNull();
      expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
    }
  });
});

const PARENT_ID = "22222222-2222-2222-2222-222222222222";

function mockJoinedCommunity() {
  harness.session = { user: { id: "user-1", name: "Grace" } };
  harness.getOnboardingCodeInfo.mockResolvedValue(info);
  harness.redeemOnboardingCode.mockResolvedValue({
    organizationName: "Chicago Builders",
    eventName: "Launch Night",
    organizationId: "org-1",
  });
}

describe("onboard community link", () => {
  it("links See community to the public page of the first node by name", async () => {
    mockJoinedCommunity();
    harness.resolveTenantByOrgId.mockResolvedValue({ id: "tenant-1" });
    harness.listNodes.mockResolvedValue([
      { id: "node-z", slug: "zeta", parentId: null, name: "Zeta" },
      { id: "node-a", slug: "chicago", parentId: PARENT_ID, name: "Alpha" },
    ]);
    harness.getDiscoveryNode.mockResolvedValue({ nodeId: "node-a" });

    renderOnboard();

    const link = await screen.findByTestId("onboard.see-community");
    expect(link.textContent).toContain("See Chicago Builders");
    expect(link.getAttribute("href")).toBe(`/n/chicago?parentId=${PARENT_ID}`);
    expect(screen.getByTestId("onboard.build-button").getAttribute("href")).toBe("/build");
    expect(screen.getByTestId("onboard.home-button")).toBeTruthy();
  });

  it.each([
    [
      "the organization has no tenant",
      () => {
        harness.resolveTenantByOrgId.mockRejectedValue({ code: "NOT_FOUND" });
      },
    ],
    [
      "the tenant has no nodes",
      () => {
        harness.resolveTenantByOrgId.mockResolvedValue({ id: "tenant-1" });
        harness.listNodes.mockResolvedValue([]);
      },
    ],
    [
      "the profile is not public",
      () => {
        harness.resolveTenantByOrgId.mockResolvedValue({ id: "tenant-1" });
        harness.listNodes.mockResolvedValue([
          { id: "node-a", slug: "chicago", parentId: null, name: "Alpha" },
        ]);
        harness.getDiscoveryNode.mockResolvedValue(null);
      },
    ],
    [
      "a lookup fails",
      () => {
        harness.resolveTenantByOrgId.mockRejectedValue(new Error("Failed to fetch"));
      },
    ],
  ] as const)("hides See community when %s", async (_label, setup) => {
    mockJoinedCommunity();
    setup();

    renderOnboard();

    expect(await screen.findByTestId("onboard.build-button")).toBeTruthy();
    await waitFor(() => expect(harness.resolveTenantByOrgId).toHaveBeenCalled());
    expect(screen.queryByTestId("onboard.see-community")).toBeNull();
    expect(screen.getByTestId("onboard.home-button")).toBeTruthy();
    expect(screen.getByTestId("onboard.continue-on-computer")).toBeTruthy();
  });
});
