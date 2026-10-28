// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClearStaleTeam } from "./use-clear-stale-team";

const harness = vi.hoisted(() => ({
  setActiveTeam: vi.fn(),
  getSession: vi.fn(),
  invalidateRouter: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/i18n/runtime", () => ({
  useAppTranslation: () => (id: string) => id,
  translateAppMessage: (id: string) => id,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: harness.invalidateRouter }),
}));

vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: vi.fn() } }));

vi.mock("@/app", () => ({
  sessionQueryKey: ["session"],
  useAuthClient: () => ({
    organization: { setActiveTeam: harness.setActiveTeam },
    getSession: harness.getSession,
  }),
}));

function setup(initialStaleTeamId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(({ staleTeamId }) => useClearStaleTeam(staleTeamId), {
    wrapper,
    initialProps: { staleTeamId: initialStaleTeamId },
  });
  return { ...hook, invalidate };
}

describe("useClearStaleTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.setActiveTeam.mockResolvedValue({ error: null });
    harness.getSession.mockResolvedValue({ data: null, error: null });
    harness.invalidateRouter.mockResolvedValue(undefined);
  });

  it("does nothing without a stale team", () => {
    setup(null);

    expect(harness.setActiveTeam).not.toHaveBeenCalled();
  });

  it("clears a stale team once and refreshes the workspace", async () => {
    const { rerender, invalidate } = setup("team-empty");

    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledOnce());
    expect(harness.setActiveTeam).toHaveBeenCalledExactlyOnceWith({ teamId: null });
    expect(invalidate).toHaveBeenCalledWith(
      { queryKey: ["team-workspace"], refetchType: "active" },
      { throwOnError: true },
    );

    rerender({ staleTeamId: "team-empty" });
    expect(harness.setActiveTeam).toHaveBeenCalledOnce();
    expect(harness.toastError).not.toHaveBeenCalled();
  });

  it("offers a retry without looping when clearing fails", async () => {
    harness.setActiveTeam.mockResolvedValueOnce({ error: { message: "nope" } });
    const { rerender } = setup("team-empty");

    await waitFor(() => expect(harness.toastError).toHaveBeenCalledOnce());
    rerender({ staleTeamId: "team-empty" });
    expect(harness.setActiveTeam).toHaveBeenCalledOnce();

    const [message, options] = harness.toastError.mock.calls[0];
    expect(message).toBe("workspace.staleTeamError");
    expect(options.action.label).toBe("common.retry");

    options.action.onClick();

    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledOnce());
    expect(harness.setActiveTeam).toHaveBeenCalledTimes(2);
  });

  it("clears again when a different team becomes stale", async () => {
    const { rerender } = setup("team-a");
    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledOnce());

    rerender({ staleTeamId: "team-b" });

    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledTimes(2));
    expect(harness.setActiveTeam).toHaveBeenCalledTimes(2);
  });

  it("clears the same team again after it recovers and goes stale once more", async () => {
    const { rerender } = setup("team-x");
    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledOnce());

    rerender({ staleTeamId: null });
    rerender({ staleTeamId: "team-x" });

    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledTimes(2));
    expect(harness.setActiveTeam).toHaveBeenCalledTimes(2);
  });

  it("only retries the refresh when the team was cleared but the workspace refresh failed", async () => {
    harness.getSession.mockRejectedValueOnce(new Error("offline"));
    setup("team-empty");

    await waitFor(() => expect(harness.toastError).toHaveBeenCalledOnce());
    const [message, options] = harness.toastError.mock.calls[0];
    expect(message).toBe("workspace.refreshError");

    options.action.onClick();

    await waitFor(() => expect(harness.invalidateRouter).toHaveBeenCalledOnce());
    expect(harness.setActiveTeam).toHaveBeenCalledOnce();
    expect(harness.toastError).toHaveBeenCalledOnce();
  });
});
