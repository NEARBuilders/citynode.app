// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { nodeQueryKeys } from "@/lib/queries/nodes";
import { placeQueryKeys } from "@/lib/queries/places";
import { AppHeader } from "./app-header";

const harness = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: harness.pathname, search: {} } }),
}));
vi.mock("@/app", () => ({
  getAppName: () => "CityNode",
  useApiClient: () => ({}),
}));
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));
vi.mock("./theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("./user-nav", () => ({ UserNav: () => null }));
vi.mock("./use-identity", () => ({ useIdentity: () => ({ user: null, organizations: [] }) }));
vi.mock("./use-team-workspace", () => ({ useTeamWorkspace: () => ({ data: undefined }) }));

afterEach(cleanup);

function renderAt(pathname: string, seed: (client: QueryClient) => void = () => {}) {
  harness.pathname = pathname;
  const client = new QueryClient();
  seed(client);
  render(
    <QueryClientProvider client={client}>
      <AppHeader />
    </QueryClientProvider>,
  );
  return screen.getByTestId("app-header-breadcrumb").textContent;
}

describe("AppHeader breadcrumbs", () => {
  it("names a community page with the community's stored name", () => {
    expect(
      renderAt("/n/new-york-city", (client) =>
        client.setQueryData(nodeQueryKeys.bySlug("new-york-city"), { name: "New York City" }),
      ),
    ).toContain("New York City");
  });

  it("names a place page with the place's stored name, decoding the slug", () => {
    expect(
      renderAt("/places/s%C3%A3o-paulo", (client) =>
        client.setQueryData(placeQueryKeys.resolution("são-paulo"), {
          place: { name: "São Paulo" },
        }),
      ),
    ).toContain("São Paulo");
  });

  it("falls back to the slug before the name has loaded", () => {
    expect(renderAt("/places/kuala-lumpur")).toContain("Kuala lumpur");
  });
});
