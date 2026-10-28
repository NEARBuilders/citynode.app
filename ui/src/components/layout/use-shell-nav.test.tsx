// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@/i18n/test-render";
import { resolveCommunityMembership } from "@/lib/personal-organization";
import { useShellNav } from "./use-shell-nav";

const harness = vi.hoisted(() => ({
  identity: {} as Record<string, unknown>,
}));

vi.mock("./use-identity", () => ({ useIdentity: () => harness.identity }));
vi.mock("./use-team-workspace", () => ({ useTeamWorkspace: () => ({ data: undefined }) }));
vi.mock("@/app", () => ({
  useApiClient: () => ({ getDiscoveryStudio: () => Promise.reject(new Error("no studio")) }),
}));

const user = { id: "user-1" };
const personal = { id: "org-personal", slug: "personal", metadata: { isPersonal: true } };
const harbor = { id: "org-harbor", slug: "harbor", status: "active", metadata: {} };

function identity({
  organizations,
  activeOrganizationId = null,
  loading = false,
}: {
  organizations: (typeof harbor | typeof personal)[] | undefined;
  activeOrganizationId?: string | null;
  loading?: boolean;
}) {
  harness.identity = {
    user,
    activeOrg: organizations?.find((org) => org.id === activeOrganizationId),
    organizations: organizations ?? [],
    isOrganizationsLoading: loading,
    membership: resolveCommunityMembership({
      organizations,
      activeOrganizationId,
      userId: user.id,
    }),
  };
}

afterEach(() => {
  harness.identity = {};
});

function sidebarSlugs(isAdmin = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useShellNav(isAdmin), { wrapper });
  return result.current.flatMap((item) => [item.slug, ...(item.children ?? []).map((c) => c.slug)]);
}

describe("sidebar community entry", () => {
  it("offers Start a community to someone whose only organization is personal", () => {
    identity({ organizations: [personal], activeOrganizationId: personal.id });
    expect(sidebarSlugs()).toContain("start-community");
    expect(sidebarSlugs()).not.toContain("my-node");
  });

  it("offers Start a community to someone with no organization", () => {
    identity({ organizations: [] });
    expect(sidebarSlugs()).toContain("start-community");
  });

  it("keeps My community for a member, active or not", () => {
    identity({ organizations: [personal, harbor], activeOrganizationId: harbor.id });
    expect(sidebarSlugs()).toContain("my-node");
    identity({ organizations: [personal, harbor] });
    expect(sidebarSlugs()).toContain("my-node");
    expect(sidebarSlugs()).not.toContain("start-community");
  });

  it("doesn't flash Start a community while organizations load or fail", () => {
    identity({ organizations: undefined, loading: true });
    expect(sidebarSlugs()).not.toContain("start-community");
    identity({ organizations: undefined });
    expect(sidebarSlugs()).not.toContain("start-community");
  });

  it("keeps a platform admin's current entries", () => {
    identity({ organizations: [personal], activeOrganizationId: personal.id });
    const slugs = sidebarSlugs(true);
    expect(slugs).toContain("my-node");
    expect(slugs).toContain("admin");
    expect(slugs).not.toContain("start-community");
  });
});
