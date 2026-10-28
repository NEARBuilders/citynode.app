import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: unknown) => ({ redirect: options }),
}));

const { Route: BuildRoute } = await import("./build");

type Guard = (args: unknown) => unknown;

function thrownBy(context: unknown) {
  try {
    (BuildRoute.options.beforeLoad as Guard)({ context });
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("/build", () => {
  it("sends signed-out visitors to NEAR Builders without a referral code", () => {
    expect(thrownBy({ session: null })).toEqual({
      redirect: { href: "https://nearbuilders.org/build", reloadDocument: true, replace: true },
    });
  });

  it("sends signed-in members to the same place until a referral parameter is agreed", () => {
    expect(thrownBy({ session: { user: { id: "user-1" } } })).toEqual({
      redirect: { href: "https://nearbuilders.org/build", reloadDocument: true, replace: true },
    });
  });
});
