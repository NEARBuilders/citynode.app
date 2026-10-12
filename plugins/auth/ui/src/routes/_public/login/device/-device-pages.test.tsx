// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route as ApproveRoute } from "./approve";
import { Route as VerifyRoute } from "./index";

const harness = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  device: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("everything-dev/ui/auth", () => ({
  sessionQueryOptions: () => ({ queryKey: ["session"], queryFn: async () => harness.session }),
  useAuthClient: () => ({
    device: Object.assign(harness.device, { approve: harness.approve, deny: harness.deny }),
    near: { listAccounts: vi.fn(), getNearClient: vi.fn() },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: harness.success, info: harness.info, error: harness.error },
}));

function buildAuthClient() {
  return { device: harness.device };
}

function renderAt(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRouteWithContext<Record<string, unknown>>()({ component: Outlet });
  const mount = (route: typeof VerifyRoute | typeof ApproveRoute, path: string) =>
    route.update({
      ...route.options,
      getParentRoute: () => root,
      path,
      id: undefined,
    } as never);
  const stub = (path: string, testId: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <div data-testid={testId} />,
    });
  const router = createRouter({
    routeTree: root.addChildren([
      mount(VerifyRoute, "/login/device") as never,
      mount(ApproveRoute, "/login/device/approve") as never,
      stub("/login", "login-stub"),
      stub("/", "home-stub"),
      stub("/dashboard", "dashboard-stub"),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    context: { queryClient, authClient: buildAuthClient() },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  harness.session = null;
});

describe("device code verification", () => {
  it("checks an invalid code once, stops, and lets the user enter another", async () => {
    harness.session = { user: { id: "user-1" } };
    harness.device.mockResolvedValue({ data: null, error: { status: 400 } });

    renderAt("/login/device?user_code=ABCD2345");

    expect(await screen.findByTestId("device-verify-error")).toBeTruthy();
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(harness.device).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("device-claiming")).toBeNull();
    expect(screen.queryByTestId("device-verified-code")).toBeNull();
    expect(screen.getByTestId("device-user-code-input")).toBeTruthy();
  });

  it("re-checks the same code only when the user submits it again", async () => {
    harness.session = { user: { id: "user-1" } };
    harness.device.mockResolvedValue({ data: null, error: { status: 400 } });

    renderAt("/login/device?user_code=ABCD2345");
    await screen.findByTestId("device-verify-error");

    fireEvent.click(screen.getByTestId("device-verify-button"));

    await waitFor(() => expect(harness.device).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("device-verify-error")).toBeTruthy();
  });

  it("shows a connection error instead of retrying when the check throws", async () => {
    harness.session = { user: { id: "user-1" } };
    harness.device.mockRejectedValue(new TypeError("Failed to fetch"));

    renderAt("/login/device?user_code=ABCD2345");

    expect((await screen.findByTestId("device-verify-error")).textContent).toBe(
      "Check your connection and try again.",
    );
    expect(harness.device).toHaveBeenCalledOnce();
  });

  it("rejects a malformed code without calling the server", async () => {
    harness.session = { user: { id: "user-1" } };

    renderAt("/login/device");
    fireEvent.change(await screen.findByTestId("device-user-code-input"), {
      target: { value: "AB!" },
    });
    fireEvent.click(screen.getByTestId("device-verify-button"));

    expect(await screen.findByTestId("device-verify-error")).toBeTruthy();
    expect(harness.device).not.toHaveBeenCalled();
  });

  it("continues to approval with a normalized code", async () => {
    harness.session = { user: { id: "user-1" } };
    harness.device.mockResolvedValue({ data: { user_code: "ABCD2345" }, error: null });

    const router = renderAt("/login/device");
    fireEvent.change(await screen.findByTestId("device-user-code-input"), {
      target: { value: " abcd-2345 " },
    });
    fireEvent.click(screen.getByTestId("device-verify-button"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login/device/approve"));
    expect(harness.device).toHaveBeenCalledWith({ query: { user_code: "ABCD2345" } });
  });
});

describe("device approval", () => {
  it("keeps the request on screen when denying fails", async () => {
    harness.session = { user: { id: "user-1" } };
    harness.deny.mockResolvedValue({ data: null, error: { status: 500, message: "boom" } });

    const router = renderAt("/login/device/approve?user_code=ABCD2345");
    fireEvent.click(await screen.findByTestId("device-deny-button"));

    expect((await screen.findByTestId("device-approve-error")).textContent).toBe(
      "Could not deny this request. Try again.",
    );
    expect(harness.info).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/login/device/approve");
  });

  it("confirms the denial and leaves only after the server accepts it", async () => {
    harness.session = { user: { id: "user-1" } };
    harness.deny.mockResolvedValue({ data: { success: true }, error: null });

    const router = renderAt("/login/device/approve?user_code=ABCD2345");
    fireEvent.click(await screen.findByTestId("device-deny-button"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(harness.deny).toHaveBeenCalledWith({ userCode: "ABCD2345" });
    expect(harness.info).toHaveBeenCalledWith("Sign-in request denied");
  });

  it("does not report success when approving throws", async () => {
    harness.session = { user: { id: "user-1" } };
    harness.approve.mockRejectedValue(new TypeError("Failed to fetch"));

    const router = renderAt("/login/device/approve?user_code=ABCD2345");
    fireEvent.click(await screen.findByTestId("device-approve-button"));

    expect(await screen.findByTestId("device-approve-error")).toBeTruthy();
    expect(harness.success).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/login/device/approve");
    expect(screen.getByTestId("device-approve-button")).toHaveProperty("disabled", false);
  });

  it("sends a signed-out visitor to sign in with every pairing parameter preserved", async () => {
    const router = renderAt(
      "/login/device/approve?user_code=ABCD2345&pubKey=ed25519%3Aabc&contract=kv.near&source=cli",
    );
    fireEvent.click(await screen.findByTestId("device-approve-signin-button"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    const redirectTarget = new URL(
      String((router.state.location.search as { redirect?: string }).redirect),
      "http://localhost",
    );
    expect(redirectTarget.pathname).toBe("/login/device");
    expect(redirectTarget.searchParams.get("user_code")).toBe("ABCD2345");
    expect(redirectTarget.searchParams.get("pubKey")).toBe("ed25519:abc");
    expect(redirectTarget.searchParams.get("contract")).toBe("kv.near");
    expect(redirectTarget.searchParams.get("source")).toBe("cli");
  });
});
