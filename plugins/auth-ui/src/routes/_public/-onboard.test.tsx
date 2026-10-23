// @vitest-environment jsdom
import { createORPCErrorFromJson } from "@orpc/client";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { refreshSessionCache, signInWithPasskey } from "everything-dev/ui/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_LOCALE_COOKIE } from "@/i18n/catalogs";
import { render } from "@/i18n/test-render";
import { Route as OnboardRoute } from "./onboard";

const harness = vi.hoisted(() => ({
  session: null as { user: { id: string; name: string } } | null,
  sessionGate: null as Promise<never> | null,
  getOnboardingCodeInfo: vi.fn(),
  redeemOnboardingCode: vi.fn(),
  detectNearAccount: vi.fn(async () => null as { accountId?: string | null } | null),
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
    near: { detectNearAccount: harness.detectNearAccount },
    updateUser: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("better-near-auth/client", () => ({ isPasskeyWalletAvailable: () => true }));

const CODE = "valid-code-12345";

function definedError(code: string, message = code, data: Record<string, unknown> = {}) {
  return createORPCErrorFromJson({ defined: true, code, message, data });
}

// The failures the published auth plugin returns from redeemOnboardingCode:
// a status code and its message, with no structured reason in `data`.
const redeemFailures = {
  organization_not_active: ["FORBIDDEN", "Organization requires platform-admin approval", {}],
  organization_full: ["FORBIDDEN", "This organization is full, so no more members can join", {}],
  code_revoked: ["FORBIDDEN", "This onboarding code was revoked", {}],
  code_used_up: ["FORBIDDEN", "This onboarding code has reached its limit", {}],
  code_expired: ["BAD_REQUEST", "This onboarding code has expired", {}],
  code_not_found: ["NOT_FOUND", "Onboarding code not found", { resource: "onboardingCode" }],
  organization_not_found: ["BAD_REQUEST", "Organization not found", {}],
} as const;

type RedeemReason = keyof typeof redeemFailures;

function joinFailure(reason: RedeemReason) {
  const [code, message, data] = redeemFailures[reason];
  return definedError(code, message, data);
}

async function settleRedeem() {
  await waitFor(() => expect(harness.redeemOnboardingCode).toHaveBeenCalled());
  await act(async () => {
    await Promise.allSettled(
      harness.redeemOnboardingCode.mock.results.map((result) => result.value),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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

function renderOnboard(path = `/onboard?code=${CODE}`) {
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
    history: createMemoryHistory({ initialEntries: [path] }),
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
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
  sessionStorage.clear();
  focusManager.setFocused(undefined);
  vi.clearAllMocks();
  harness.session = null;
  harness.sessionGate = null;
  harness.detectNearAccount.mockResolvedValue(null);
  sessionStorage.clear();
  Reflect.set(
    document,
    "cookie",
    `${LOGIN_LOCALE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`,
  );
});

describe("onboard join flow", () => {
  it("invites a signed-out visitor at step 1 with account creation first", async () => {
    harness.getOnboardingCodeInfo.mockResolvedValue(info);

    renderOnboard();

    const invite = await screen.findByTestId("onboard.invite");
    expect(invite.textContent).toContain("Chicago Builders");
    expect(invite.textContent).toContain("Launch Night");
    expect(screen.getByTestId("onboard.progress").getAttribute("data-step")).toBe("1");
    expect(screen.getByTestId("onboard.progress").textContent).toContain("Join the community");
    expect(screen.getByTestId("onboard.progress").textContent).not.toMatch(/organization/i);
    expect(screen.getByTestId("onboard.create-account-button")).toBeTruthy();
    expect(harness.redeemOnboardingCode).not.toHaveBeenCalled();
  });

  it.each([
    ["es", "Únete a la comunidad", "Launch Night con Chicago Builders"],
    ["fr", "Rejoignez la communauté", "Launch Night avec Chicago Builders"],
    ["zh", "加入社区", "与 Chicago Builders 一起参加 Launch Night"],
  ] as const)("renders /onboard in %s", async (locale, stepJoin, inviteLine) => {
    harness.getOnboardingCodeInfo.mockResolvedValue(info);

    renderOnboard();
    fireEvent.change(await screen.findByTestId("onboard.language-select"), {
      target: { value: locale },
    });

    await waitFor(() =>
      expect(screen.getByTestId("onboard.progress").textContent).toContain(stepJoin),
    );
    expect(screen.getByTestId("onboard.invite").textContent).toBe(inviteLine);
    expect(screen.getByTestId("onboard.create-account-button").textContent).not.toMatch(
      /create account/i,
    );
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
    expect(screen.queryByTestId("onboard.build-button")).toBeNull();
  });

  it("skips the name step for a returning member who already chose a name", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    renderOnboard();

    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
    expect(screen.queryByTestId("onboard.display-name")).toBeNull();
  });

  it("keeps the joined panel after a reload when the code has since expired", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    const view = renderOnboard();
    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
    view.unmount();

    // The server refuses a repeat redeem once the code has expired, so the
    // reload must not depend on joining again.
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, expired: true });
    harness.redeemOnboardingCode.mockRejectedValue(joinFailure("code_expired"));

    renderOnboard();

    expect(await screen.findByTestId("onboard.success")).toBeTruthy();
    expect(screen.queryByTestId("onboard.unavailable")).toBeNull();
    expect(harness.redeemOnboardingCode).toHaveBeenCalledTimes(1);
  });

  it("does not show a join from earlier in the tab to a different signed-in member", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    const view = renderOnboard();
    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
    view.unmount();

    harness.session = { user: { id: "user-2", name: "Alan" } };
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, usedUp: true });
    harness.redeemOnboardingCode.mockRejectedValue(joinFailure("code_used_up"));

    renderOnboard();

    expect((await screen.findByTestId("onboard.unavailable")).textContent).toMatch(/used up/i);
    expect(screen.queryByTestId("onboard.success")).toBeNull();
    expect(harness.redeemOnboardingCode).toHaveBeenCalledTimes(2);
  });

  it("does not carry a previous visitor's join over to the next one in the same tab", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    const view = renderOnboard();
    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
    view.unmount();

    harness.session = null;
    renderOnboard();

    expect(await screen.findByTestId("onboard.invite")).toBeTruthy();
    expect(screen.queryByTestId("onboard.success")).toBeNull();
    expect(harness.redeemOnboardingCode).toHaveBeenCalledTimes(1);
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
    harness.redeemOnboardingCode.mockRejectedValue(joinFailure("code_used_up"));

    renderOnboard();

    expect((await screen.findByTestId("onboard.unavailable")).textContent).toMatch(/used up/i);
    expect(screen.queryByTestId("onboard.error")).toBeNull();
  });

  it("keeps a revoked code unavailable without waiting on the join", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, revoked: true });
    harness.redeemOnboardingCode.mockReturnValue(new Promise(() => undefined));

    renderOnboard();

    expect((await screen.findByTestId("onboard.unavailable")).textContent).toMatch(/turned off/i);
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

  it("treats a missing or malformed code as an invalid invitation", async () => {
    renderOnboard("/onboard");

    expect(await screen.findByTestId("onboard.invalid")).toBeTruthy();
    expect(screen.queryByTestId("onboard.loading")).toBeNull();
    expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
  });

  it("keeps an unknown code distinct from a lookup failure", async () => {
    harness.getOnboardingCodeInfo.mockResolvedValue(null);

    renderOnboard();

    expect(await screen.findByTestId("onboard.not-found")).toBeTruthy();
    expect(screen.queryByTestId("onboard.load-error")).toBeNull();
    expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
    expect(screen.queryByTestId("onboard.loading")).toBeNull();
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

  it("shows the loading state while a first failed invitation lookup retries", async () => {
    harness.getOnboardingCodeInfo
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValue(new Promise(() => undefined));

    renderOnboard();
    fireEvent.click(await screen.findByTestId("onboard.retry-button"));

    expect(await screen.findByTestId("onboard.loading")).toBeTruthy();
    expect(screen.queryByTestId("onboard.load-error")).toBeNull();
  });

  it("disables Retry while a failed invitation refresh retries", async () => {
    harness.getOnboardingCodeInfo
      .mockResolvedValueOnce(info)
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValue(new Promise(() => undefined));

    renderOnboard();
    expect(await screen.findByTestId("onboard.invite")).toBeTruthy();
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    const retry = await screen.findByTestId("onboard.retry-button");
    expect(retry.hasAttribute("disabled")).toBe(false);

    fireEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByTestId("onboard.retry-button").hasAttribute("disabled")).toBe(true),
    );
    expect(harness.getOnboardingCodeInfo).toHaveBeenCalledTimes(3);
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
    expect(screen.queryByText("Contact the community for a new link")).toBeNull();

    fireEvent.click(screen.getByTestId("onboard.retry-button"));
    expect(await screen.findByTestId("onboard.success")).toBeTruthy();
  });

  it.each([
    "expired",
    "usedUp",
  ] as const)("retries a network failure while joining a %s code instead of asking for a new link", async (flag) => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue({
      ...info,
      expired: flag === "expired",
      usedUp: flag === "usedUp",
    });
    harness.redeemOnboardingCode
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue({
        organizationName: "Chicago Builders",
        eventName: "Launch Night",
      });

    renderOnboard();

    expect(await screen.findByText("Couldn't join right now")).toBeTruthy();
    expect(screen.getByTestId("onboard.retry-button")).toBeTruthy();
    expect(screen.queryByTestId("onboard.unavailable")).toBeNull();
    expect(screen.queryByText("Contact the community for a new link")).toBeNull();

    fireEvent.click(screen.getByTestId("onboard.retry-button"));
    expect(await screen.findByTestId("onboard.success")).toBeTruthy();
  });

  it("keeps a revoked code unavailable when joining fails on the network", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue({ ...info, revoked: true });
    harness.redeemOnboardingCode.mockRejectedValue(new Error("Failed to fetch"));

    renderOnboard();
    await settleRedeem();

    expect(screen.getByTestId("onboard.unavailable")).toBeTruthy();
    expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
    expect(screen.queryByText("Couldn't join right now")).toBeNull();
  });

  it("sends a member whose session lapsed back to sign in, then joins", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode
      .mockRejectedValueOnce(definedError("UNAUTHORIZED"))
      .mockResolvedValue(joined);
    vi.mocked(signInWithPasskey).mockImplementation(async (_auth, options) => {
      await options?.onSuccess?.();
    });

    renderOnboard();

    expect(await screen.findByTestId("onboard.create-account-button")).toBeTruthy();
    expect(screen.getByTestId("onboard.sign-in-again").textContent).toContain(
      "Sign in with a different account",
    );
    expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
    expect(screen.queryByTestId("onboard.error")).toBeNull();
    expect(refreshSessionCache).toHaveBeenCalled();
    expect(harness.redeemOnboardingCode).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("onboard.existing-account-button"));
    fireEvent.click(await screen.findByTestId("onboard.passkey-signin-button"));

    expect(await screen.findByTestId("onboard.success")).toBeTruthy();
    expect(harness.redeemOnboardingCode).toHaveBeenCalledTimes(2);
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
    harness.redeemOnboardingCode.mockRejectedValue(joinFailure(reason));

    renderOnboard();

    expect(await screen.findByText(title)).toBeTruthy();
    if (actionTestId) {
      expect(screen.getByTestId(actionTestId)).toBeTruthy();
      expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
    } else {
      expect(screen.getByText("Contact the community for a new link")).toBeTruthy();
      expect(screen.queryByTestId("onboard.explore-button")).toBeNull();
      expect(screen.queryByTestId("onboard.retry-button")).toBeNull();
    }
  });

  it("prefers a reason the server sends over the message", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockRejectedValue(
      definedError("FORBIDDEN", "Forbidden", { reason: "organization_full" }),
    );

    renderOnboard();

    expect(await screen.findByText("This community is full")).toBeTruthy();
    expect(screen.getByTestId("onboard.explore-button")).toBeTruthy();
  });

  it("treats a not-found that is not about the code as a join it can retry", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockRejectedValue(definedError("NOT_FOUND", "Not found"));

    renderOnboard();

    expect(await screen.findByText("Couldn't join right now")).toBeTruthy();
    expect(screen.getByTestId("onboard.retry-button")).toBeTruthy();
  });

  it("drops the join when the member signs out and joins the next member on their own", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockResolvedValue(joined);

    const { queryClient } = renderOnboard();
    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();

    harness.session = null;
    await act(() => queryClient.refetchQueries({ queryKey: ["session"] }));
    await waitFor(() => expect(screen.queryByTestId("onboard.success")).toBeNull());

    harness.session = { user: { id: "user-2", name: "Alan" } };
    harness.redeemOnboardingCode.mockRejectedValue(joinFailure("code_used_up"));
    await act(() => queryClient.refetchQueries({ queryKey: ["session"] }));

    expect(await screen.findByText("This invitation has been used up")).toBeTruthy();
    expect(screen.queryByTestId("onboard.success")).toBeNull();
    expect(harness.redeemOnboardingCode).toHaveBeenCalledTimes(2);
  });

  it("treats an unrecognised refusal as a join it can retry", async () => {
    harness.session = { user: { id: "user-1", name: "Grace" } };
    harness.getOnboardingCodeInfo.mockResolvedValue(info);
    harness.redeemOnboardingCode.mockRejectedValue(definedError("FORBIDDEN", "Something else"));

    renderOnboard();

    expect(await screen.findByText("Couldn't join right now")).toBeTruthy();
    expect(screen.getByTestId("onboard.retry-button")).toBeTruthy();
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

  it("links to the community's public page from the done state", async () => {
    joinAsNamedMember();
    communityWithNodes([{ id: "node-a", slug: "chicago", name: "Chicago", parentId: null }]);

    renderOnboard();

    const link = await screen.findByTestId("onboard.community-link");
    expect(link.getAttribute("href")).toBe("/n/chicago");
    expect(link.textContent).toContain("See Chicago Builders");
    expect(harness.resolveTenantByOrgId).toHaveBeenCalledWith({ orgId: "org-1" });
    expect(harness.listNodes).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    expect(screen.getByTestId("onboard.continue-on-computer")).toBeTruthy();
    expect(screen.getByTestId("onboard.home-button")).toBeTruthy();
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

    expect(await screen.findByTestId("onboard.continue-on-computer")).toBeTruthy();
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
    expect(screen.getByTestId("onboard.home-button")).toBeTruthy();
  });
});
