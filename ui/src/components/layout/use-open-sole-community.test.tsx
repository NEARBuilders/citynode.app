// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenSoleCommunity } from "./use-open-sole-community";

const harness = vi.hoisted(() => ({
  setActive: vi.fn(),
  getSession: vi.fn(),
  invalidateRouter: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/i18n/runtime", () => ({
  useAppTranslation: () => (id: string) => id,
  translateAppMessage: (id: string) => id,
}));

vi.mock("@/i18n/error-message", () => ({
  appErrorMessage: (error: Error) => error.message,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: harness.invalidateRouter }),
}));

vi.mock("sonner", () => ({
  toast: { error: harness.toastError, success: harness.toastSuccess },
}));

vi.mock("@/app", () => ({
  sessionQueryKey: ["session"],
  useAuthClient: () => ({
    organization: { setActive: harness.setActive },
    getSession: harness.getSession,
  }),
}));

function setup(initialOrganizationId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(({ organizationId }) => useOpenSoleCommunity(organizationId), {
    wrapper,
    initialProps: { organizationId: initialOrganizationId },
  });
}

describe("useOpenSoleCommunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.setActive.mockResolvedValue({ error: null });
    harness.getSession.mockResolvedValue({ data: null, error: null });
    harness.invalidateRouter.mockResolvedValue(undefined);
  });

  it("does nothing when there is no single community to open", () => {
    setup(null);
    expect(harness.setActive).not.toHaveBeenCalled();
  });

  it("makes the only community active once and refreshes, without a switch toast", async () => {
    const { rerender } = setup("org-harbor");

    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledOnce());
    expect(harness.setActive).toHaveBeenCalledExactlyOnceWith({ organizationId: "org-harbor" });
    rerender({ organizationId: "org-harbor" });
    expect(harness.setActive).toHaveBeenCalledOnce();
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    expect(harness.toastError).not.toHaveBeenCalled();
  });

  it("offers a retry without looping when opening fails", async () => {
    harness.setActive.mockResolvedValueOnce({ error: { message: "nope" } });
    const { rerender } = setup("org-harbor");

    await waitFor(() => expect(harness.toastError).toHaveBeenCalledOnce());
    rerender({ organizationId: "org-harbor" });
    expect(harness.setActive).toHaveBeenCalledOnce();

    const [, options] = harness.toastError.mock.calls[0];
    expect(options.action.label).toBe("common.retry");
    options.action.onClick();
    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledOnce());
    expect(harness.setActive).toHaveBeenCalledTimes(2);
  });
});
