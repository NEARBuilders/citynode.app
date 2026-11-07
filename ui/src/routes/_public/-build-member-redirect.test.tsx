// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ dashboard: vi.fn() }));

vi.mock("@/app", () => ({
  useAuthClient: () => ({ referrals: { dashboard: harness.dashboard } }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
}));

const { Route: BuildRoute } = await import("./build");
const MemberBuildRedirect = BuildRoute.options.component as () => null;

const replace = vi.fn();

beforeEach(() => {
  vi.stubGlobal("location", { ...window.location, replace });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
  harness.dashboard.mockReset();
});

describe("/build", () => {
  it("redirects with the member's referral code", async () => {
    harness.dashboard.mockResolvedValue({ data: { code: "abc123" }, error: null });
    render(<MemberBuildRedirect />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("https://nearbuilders.org/build?ref=abc123"),
    );
  });

  it("redirects signed-out visitors without a code", async () => {
    harness.dashboard.mockResolvedValue({ data: null, error: { status: 401 } });
    render(<MemberBuildRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://nearbuilders.org/build"));
  });

  it("redirects without a code when the lookup fails", async () => {
    harness.dashboard.mockRejectedValue(new Error("network"));
    render(<MemberBuildRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://nearbuilders.org/build"));
  });

  it("doesn't redirect after it unmounts", async () => {
    let resolve: (value: unknown) => void = () => {};
    harness.dashboard.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = render(<MemberBuildRedirect />);
    unmount();
    resolve({ data: { code: "abc123" }, error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(replace).not.toHaveBeenCalled();
  });
});
