import { describe, expect, it, vi } from "vitest";
import { Route } from "./index";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: unknown) => ({ redirect: options }),
}));

describe("/admin", () => {
  it("sends platform admins to Home, which is the overview now", () => {
    const { beforeLoad } = (Route as unknown as { options: { beforeLoad: () => void } }).options;
    expect(() => beforeLoad()).toThrow(
      expect.objectContaining({ redirect: { to: "/dashboard", replace: true } }),
    );
  });
});
