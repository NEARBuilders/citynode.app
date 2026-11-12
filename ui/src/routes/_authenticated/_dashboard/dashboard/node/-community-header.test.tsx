// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { CommunityHeader } from "./-community-header";

const harness = vi.hoisted(() => ({
  listing: null as unknown,
  authContext: null as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: forwardRef<
    HTMLAnchorElement,
    {
      children?: ReactNode;
      to?: string;
      params?: { slug?: string };
      search?: Record<string, string | undefined>;
    }
  >(({ children, to, params, search, ...props }, ref) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).filter((entry): entry is [string, string] => !!entry[1]),
    ).toString();
    const path = to?.replace("$slug", params?.slug ?? "") ?? "/";
    return (
      <a ref={ref} href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    );
  }),
  useNavigate: () => vi.fn(),
  useRouteContext: () => ({ auth: { activeOrganizationId: "org-1" }, runtimeConfig: {} }),
}));

const node = {
  id: "00000000-0000-4000-8000-000000000002",
  tenantId: "tenant-1",
  slug: "chicago",
  name: "Chicago",
  kind: "city",
  parentId: "00000000-0000-4000-8000-000000000001",
  metadata: {},
};

vi.mock("@/app", () => ({
  buildTenantUrl: () => null,
  getActiveRuntime: () => null,
  useApiClient: () => ({
    auth: {
      getContext: async () => harness.authContext,
      listOrganizations: async () => [
        { id: "org-1", name: "Chicago", slug: "chicago-builders", status: "active" },
      ],
    },
    getNode: async () => node,
    listNodes: async () => [node],
    getDiscoveryNode: async () => harness.listing,
  }),
}));

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  harness.listing = null;
  harness.authContext = null;
});

function renderHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <CommunityHeader
        nodeId={node.id}
        node={node as never}
        active="overview"
        headerTestId="community-header"
      />
    </QueryClientProvider>,
  );
  return client;
}

describe("CommunityHeader organization link", () => {
  it("takes owners and organizers to their organization in one click", async () => {
    harness.authContext = { organization: { member: { role: "owner" }, teams: [] } };
    renderHeader();
    const link = await screen.findByTestId("community-header.organization");
    await waitFor(() => expect(link.getAttribute("href")).toBe("/orgs/chicago-builders"));
    expect(link.textContent).toContain("Organization");

    cleanup();
    harness.authContext = {
      organization: { member: { role: "member" }, teams: [{ id: "t", areas: ["events"] }] },
    };
    renderHeader();
    expect(await screen.findByTestId("community-header.organization")).toBeTruthy();
  });

  it("leaves it out for plain members", async () => {
    harness.authContext = { organization: { member: { role: "member" }, teams: [] } };
    const client = renderHeader();
    await waitFor(() =>
      expect(client.getQueryState(["home-auth-context", "org-1"])?.status).toBe("success"),
    );
    expect(screen.queryByTestId("community-header.organization")).toBeNull();
  });
});

describe("CommunityHeader public page link", () => {
  it("opens a child community's public page with its parent in the URL", async () => {
    harness.listing = { slug: "chicago", parentId: node.parentId };
    renderHeader();
    const link = await screen.findByTestId("community-header.public-page");
    expect(link.getAttribute("href")).toBe(`/n/chicago?parentId=${node.parentId}`);
    expect(link.textContent).toContain("Open public page");
    expect(screen.getByTestId("community-header.view-explore")).toBeTruthy();
  });

  it("links a top-level community without a parent", async () => {
    harness.listing = { slug: "illinois", parentId: null };
    renderHeader();
    const link = await screen.findByTestId("community-header.public-page");
    expect(link.getAttribute("href")).toBe("/n/illinois");
  });

  it("leaves the link out when the community has no public listing", async () => {
    const client = renderHeader();
    await waitFor(() =>
      expect(client.getQueryState(["discovery-node", node.id])?.status).toBe("success"),
    );
    expect(screen.queryByTestId("community-header.public-page")).toBeNull();
    expect(screen.queryByTestId("community-header.view-explore")).toBeNull();
  });
});
