// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { ProposeHomepageCta } from "./-propose-homepage-cta";

const TENANT_ID = "00000000-0000-4000-8000-000000000276";

type TenantResult = { id: string; ownerKind: "platform" | "dao" } | Error | null;

const harness = vi.hoisted(() => ({
  session: null as unknown,
  orgs: [] as { id: string; slug: string }[],
  tenants: {} as Record<string, unknown>,
  listOrganizations: vi.fn(),
  resolveTenantByOrgId: vi.fn(),
  listMembers: vi.fn(),
  switchOrganization: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/app", async () => ({
  ...(await vi.importActual<object>("@/app")),
  useApiClient: () => ({
    auth: { listOrganizations: harness.listOrganizations },
    resolveTenantByOrgId: harness.resolveTenantByOrgId,
  }),
  useAuthClient: () => ({
    getSession: async () => ({ data: harness.session }),
    organization: { listMembers: harness.listMembers },
  }),
}));

vi.mock("@/components/layout/use-switch-organization", () => ({
  useSwitchOrganization: () => ({ mutateAsync: harness.switchOrganization, isPending: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => harness.navigate,
  Link: ({
    to,
    params,
    hash,
    children,
    ...rest
  }: {
    to: string;
    params: { tenantId: string };
    hash: string;
    children?: ReactNode;
  }) => (
    <a href={`${to.replace("$tenantId", params.tenantId)}#${hash}`} {...rest}>
      {children}
    </a>
  ),
}));

function setup(options: {
  signedIn: boolean;
  orgs?: { id: string; slug: string; status?: "active" | "pending" | "rejected" }[];
  tenants?: Record<string, TenantResult>;
  orgRole?: "owner" | "admin" | "member";
  platformRole?: "admin" | "user";
  activeOrgId?: string | null;
}) {
  harness.session = options.signedIn
    ? {
        user: { id: "u1", isAnonymous: false, role: options.platformRole ?? "user" },
        session: {
          activeOrganizationId:
            options.activeOrgId === undefined ? options.orgs?.[0]?.id : options.activeOrgId,
        },
      }
    : null;
  harness.listMembers.mockResolvedValue({
    data: { members: [{ userId: "u1", role: options.orgRole ?? "owner" }] },
    error: null,
  });
  harness.listOrganizations.mockResolvedValue(
    (options.orgs ?? []).map((org) => ({ status: "active", ...org })),
  );
  harness.resolveTenantByOrgId.mockImplementation(async ({ orgId }: { orgId: string }) => {
    const result = options.tenants?.[orgId] ?? null;
    if (result instanceof Error) throw result;
    return result;
  });
}

function renderCta(tenantId: string | null = TENANT_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProposeHomepageCta tenantId={tenantId} />
    </QueryClientProvider>,
  );
}

async function settle() {
  await waitFor(() => expect(harness.listOrganizations).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(() => {
  harness.listOrganizations.mockReset();
  harness.resolveTenantByOrgId.mockReset();
  harness.listMembers.mockReset();
  harness.switchOrganization.mockReset();
  harness.navigate.mockReset();
});

afterEach(cleanup);

describe("ProposeHomepageCta", () => {
  it("does not expose the proposal link for an organization awaiting approval", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org", status: "pending" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "dao" } },
    });
    renderCta();
    await settle();
    expect(screen.queryByTestId("node-page.propose-homepage")).toBeNull();
    expect(harness.resolveTenantByOrgId).not.toHaveBeenCalled();
  });

  it.each([
    "owner",
    "admin",
  ] as const)("links an owning organization %s to the published config in Community settings", async (orgRole) => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "dao" } },
      orgRole,
    });
    renderCta();

    const link = await screen.findByTestId("node-page.propose-homepage");
    expect(link.getAttribute("href")).toBe(`/tenant/${TENANT_ID}#published-config`);
    expect(link.textContent).toContain("Propose homepage change");
  });

  it("makes a non-active owning organization active before opening Community settings", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "dao" } },
      activeOrgId: "org-other",
    });
    harness.switchOrganization.mockResolvedValue(undefined);
    renderCta();

    fireEvent.click(await screen.findByTestId("node-page.propose-homepage"));

    await waitFor(() =>
      expect(harness.navigate).toHaveBeenCalledWith({
        to: "/tenant/$tenantId",
        params: { tenantId: TENANT_ID },
        hash: "published-config",
      }),
    );
    expect(harness.switchOrganization).toHaveBeenCalledWith("org-1");
    expect(harness.switchOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      harness.navigate.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("stays put when making the owning organization active fails", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "dao" } },
      activeOrgId: null,
    });
    harness.switchOrganization.mockRejectedValue(new Error("forbidden"));
    renderCta();

    fireEvent.click(await screen.findByTestId("node-page.propose-homepage"));

    await waitFor(() => expect(harness.switchOrganization).toHaveBeenCalledWith("org-1"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.navigate).not.toHaveBeenCalled();
  });

  it("links a platform admin straight to Community settings without switching", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "dao" } },
      platformRole: "admin",
      activeOrgId: "org-other",
    });
    renderCta();

    const link = await screen.findByTestId("node-page.propose-homepage");
    expect(link.getAttribute("href")).toBe(`/tenant/${TENANT_ID}#published-config`);
    expect(harness.switchOrganization).not.toHaveBeenCalled();
  });

  it("shows the button to a platform admin in the owning organization", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "dao" } },
      orgRole: "member",
      platformRole: "admin",
    });
    renderCta();

    expect(await screen.findByTestId("node-page.propose-homepage")).toBeTruthy();
  });

  it("stays hidden for a plain member of the owning organization", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "dao" } },
      orgRole: "member",
    });
    renderCta();

    await waitFor(() => expect(harness.listMembers).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("node-page.propose-homepage")).toBeNull();
  });

  it("stays hidden and queries nothing when signed out", async () => {
    setup({ signedIn: false });
    renderCta();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("node-page.propose-homepage")).toBeNull();
    expect(harness.listOrganizations).not.toHaveBeenCalled();
    expect(harness.resolveTenantByOrgId).not.toHaveBeenCalled();
  });

  it("stays hidden for an organization owning a different tenant", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "other" }],
      tenants: { "org-1": { id: "another-tenant", ownerKind: "dao" } },
    });
    renderCta();

    await settle();
    expect(screen.queryByTestId("node-page.propose-homepage")).toBeNull();
  });

  it("stays hidden for a platform-owned tenant", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": { id: TENANT_ID, ownerKind: "platform" } },
    });
    renderCta();

    await settle();
    expect(screen.queryByTestId("node-page.propose-homepage")).toBeNull();
  });

  it("stays hidden and queries nothing without a tenant id", async () => {
    setup({ signedIn: true, orgs: [{ id: "org-1", slug: "chicago-org" }] });
    renderCta(null);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("node-page.propose-homepage")).toBeNull();
    expect(harness.listOrganizations).not.toHaveBeenCalled();
  });

  it("stays hidden when the tenant lookup fails", async () => {
    setup({
      signedIn: true,
      orgs: [{ id: "org-1", slug: "chicago-org" }],
      tenants: { "org-1": new Error("boom") },
    });
    renderCta();

    await settle();
    expect(screen.queryByTestId("node-page.propose-homepage")).toBeNull();
  });
});
