// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route } from "./index";

const harness = vi.hoisted(() => ({
  organizations: [] as unknown[],
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({ options }),
  Link: ({
    to,
    children,
    params: _params,
    ...props
  }: {
    to: string;
    params?: unknown;
    children?: ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ navigate: vi.fn() }),
}));

vi.mock("@/app", () => ({
  sessionQueryOptions: () => ({
    queryKey: ["session"],
    queryFn: async () => ({ user: { id: "user-1" }, session: { activeOrganizationId: null } }),
  }),
  useAuthClient: () => ({}),
  useApiClient: () => ({
    auth: {
      listOrganizations: async () => harness.organizations,
      listUserInvitations: async () => [],
      listMembers: async () => ({ members: [] }),
    },
    resolveTenantByOrgId: async () => ({}),
  }),
}));

vi.mock("@/components/layout/use-switch-organization", () => ({
  useSwitchOrganization: () => ({ mutate: vi.fn(), isPending: false }),
}));

const clients: QueryClient[] = [];
const defaultWidth = window.innerWidth;

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  harness.organizations = [];
  window.innerWidth = defaultWidth;
});

function renderOrganizations() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const Organizations = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={client}>
      <Organizations />
    </QueryClientProvider>,
  );
}

function isHiddenByClass(element: Element | null): boolean {
  for (let node = element; node; node = node.parentElement) {
    if (/(^|\s)(hidden|sr-only)(\s|$)/.test(node.getAttribute("class") ?? "")) return true;
  }
  return false;
}

function linksTo(path: string) {
  return document.querySelectorAll(`a[href="${path}"]`);
}

it("shows organizations without a New organization button", async () => {
  harness.organizations = [
    { id: "org-1", name: "Chicago", slug: "chicago", status: "active", metadata: null },
  ];
  renderOrganizations();
  expect(await screen.findByTestId("orgs-card-chicago")).toBeTruthy();
  expect(screen.getByTestId("orgs.heading")).toBeTruthy();
  expect(screen.queryByTestId("orgs-new-button")).toBeNull();
  expect(screen.queryByText("New organization")).toBeNull();
  expect(linksTo("/orgs/new")).toHaveLength(0);
});

it("offers Start a community instead of creating an organization when there are none", async () => {
  renderOrganizations();
  const action = await screen.findByTestId("orgs-start-community");
  expect(action.getAttribute("href")).toBe("/apply");
  expect(action.textContent).toBe("Start a community");
  expect(
    screen.getByText("Apply to run a City Node for your area. We'll walk you through each step."),
  ).toBeTruthy();
  expect(screen.queryByText("Create organization")).toBeNull();
  expect(linksTo("/orgs/new")).toHaveLength(0);
});

it("keeps the Start a community action reachable at 375 CSS pixels", async () => {
  window.innerWidth = 375;
  window.dispatchEvent(new Event("resize"));
  renderOrganizations();
  const action = await screen.findByTestId("orgs-start-community");
  expect(action.getAttribute("href")).toBe("/apply");
  expect(action.textContent).toBe("Start a community");
  expect(isHiddenByClass(action)).toBe(false);
});

it("hides the personal organization and treats personal-only as having none", async () => {
  harness.organizations = [
    {
      id: "org-p",
      name: "Personal",
      slug: "personal",
      status: "active",
      metadata: { isPersonal: true },
    },
    { id: "org-u", name: "Legacy", slug: "user-1", status: "active", metadata: null },
  ];
  renderOrganizations();
  expect(await screen.findByTestId("orgs-start-community")).toBeTruthy();
  expect(screen.queryByTestId("orgs-card-personal")).toBeNull();
  expect(screen.queryByTestId("orgs-card-user-1")).toBeNull();
});

it("lists communities next to a hidden personal organization", async () => {
  harness.organizations = [
    {
      id: "org-p",
      name: "Personal",
      slug: "personal",
      status: "active",
      metadata: { isPersonal: true },
    },
    { id: "org-1", name: "Chicago", slug: "chicago", status: "active", metadata: null },
  ];
  renderOrganizations();
  expect(await screen.findByTestId("orgs-card-chicago")).toBeTruthy();
  expect(screen.queryByTestId("orgs-card-personal")).toBeNull();
  expect(screen.queryByText("Personal")).toBeNull();
});
