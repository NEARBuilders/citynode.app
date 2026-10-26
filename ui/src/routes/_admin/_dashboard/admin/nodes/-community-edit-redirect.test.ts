import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: unknown) => ({ redirect: options }),
}));

const { Route: EditRoute } = await import("./$nodeId_.edit");

type Guard = (args: unknown) => unknown;

describe("old community edit page", () => {
  it("redirects to the community page with the editor open", () => {
    let thrown: unknown;
    try {
      (EditRoute.options.beforeLoad as Guard)({ params: { nodeId: "n1" } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual({
      redirect: {
        to: "/admin/nodes/$nodeId",
        params: { nodeId: "n1" },
        search: { edit: true },
        replace: true,
      },
    });
  });
});
