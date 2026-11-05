import { ORPCError } from "@orpc/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: unknown) => ({ redirect: options }),
  Link: () => null,
}));

const { Route: GoRoute } = await import("./go.$slug");

type Loader = (args: unknown) => Promise<unknown>;

async function settle(openOnboardingLink: (input: { slug: string }) => Promise<unknown>) {
  const load = GoRoute.options.loader as Loader;
  try {
    return {
      returned: await load({
        params: { slug: "ab23cd45" },
        context: { apiClient: { openOnboardingLink } },
      }),
    };
  } catch (thrown) {
    return { thrown };
  }
}

describe("/go/$slug", () => {
  it("counts the scan and sends the visitor to the link's destination", async () => {
    const open = vi.fn(async () => ({ destination: "https://t.me/citynode" }));

    expect(await settle(open)).toEqual({
      thrown: { redirect: { href: "https://t.me/citynode", reloadDocument: true, replace: true } },
    });
    expect(open).toHaveBeenCalledWith({ slug: "ab23cd45" });
  });

  it("shows the inactive page for a link that's off or unknown", async () => {
    const open = vi.fn(async () => {
      throw new ORPCError("NOT_FOUND", { message: "This link isn't active" });
    });

    expect(await settle(open)).toEqual({ returned: { inactive: true } });
  });

  it("lets other failures reach the error page", async () => {
    const failure = new ORPCError("INTERNAL_SERVER_ERROR");

    expect(await settle(vi.fn(async () => Promise.reject(failure)))).toEqual({ thrown: failure });
  });
});
