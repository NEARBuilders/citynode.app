import { describe, expect, it } from "vitest";
import { translateAppMessage } from "@/i18n/runtime";
import { crumbsFor } from "./breadcrumbs";
import {
  buildNavItems,
  filterSidebarByArea,
  filterSidebarByRole,
  filterSidebarByRoutes,
  groupSidebarItems,
  isNavItemActive,
  type ManifestRoute,
  NAV_ITEMS,
  navSlug,
  routePathsFromManifest,
  type SidebarItem,
} from "./nav-items";

function flattenPaths(items: SidebarItem[]): string[] {
  return items.flatMap((item) => [item.to, ...(item.children ? flattenPaths(item.children) : [])]);
}

function flattenSlugs(items: SidebarItem[]): string[] {
  return items.flatMap((item) => [
    navSlug(item),
    ...(item.children ? flattenSlugs(item.children) : []),
  ]);
}

describe("sidebar navigation", () => {
  it("orders the sidebar as Home, Explore, Stake, My community, Members & roles, Curation, Admin", () => {
    const labels = filterSidebarByRole(buildNavItems({ isAdmin: true }), "admin").map(
      (item) => item.label,
    );
    expect(labels).toEqual([
      "Home",
      "Explore",
      "Stake",
      "My community",
      "Members & roles",
      "Curation",
      "Admin",
    ]);
  });

  it("shows Members & roles only to people who manage the organization", () => {
    const slugs = (context: Parameters<typeof buildNavItems>[0]) =>
      filterSidebarByRole(buildNavItems(context), "member").map(navSlug);
    expect(slugs({ hasOrganization: true })).not.toContain("orgs");
    expect(slugs({ hasOrganization: true, canManageOrganization: true })).toContain("orgs");
  });

  it("keeps the organization in reach of events organizers so they can start onboarding there", () => {
    const slugs = (context: Parameters<typeof buildNavItems>[0]) =>
      filterSidebarByRole(buildNavItems(context), "member").map(navSlug);
    expect(slugs({ hasOrganization: true, canOrganizeEvents: true })).toContain("orgs");
    expect(slugs({ hasOrganization: true, canOrganizeEvents: false })).not.toContain("orgs");
  });

  it("offers Start a community instead of My community to people without one", () => {
    const tos = (context: Parameters<typeof buildNavItems>[0], role: "member" | "admin") =>
      filterSidebarByRole(buildNavItems(context), role).map((item) => item.to);
    expect(tos({ hasOrganization: false }, "member")).toContain("/apply");
    expect(tos({ hasOrganization: false }, "member")).not.toContain("/dashboard/node");
    expect(tos({ hasOrganization: true }, "member")).not.toContain("/apply");
    expect(tos({ hasOrganization: false, isAdmin: true }, "admin")).not.toContain("/apply");
  });

  it("keeps the test ids the browser specs rely on", () => {
    const slugs = flattenSlugs(filterSidebarByRole(buildNavItems({ isAdmin: true }), "admin"));
    expect(slugs).toEqual(
      expect.arrayContaining([
        "dashboard",
        "explore",
        "stake",
        "my-node",
        "orgs",
        "discover",
        "admin",
      ]),
    );
  });

  it("shows Directory only to curators and admins", () => {
    const member = (canCurate: boolean) =>
      filterSidebarByRole(buildNavItems({ canCurate }), "member").map((item) => item.to);
    expect(member(false)).not.toContain("/discover");
    expect(member(true)).toContain("/discover");
  });

  it("links Organization to the active organization, falling back to the list", () => {
    const orgTo = (activeOrgSlug: string | null) =>
      buildNavItems({ activeOrgSlug, canManageOrganization: true }).find(
        (item) => navSlug(item) === "orgs",
      )?.to;
    expect(orgTo("acme")).toBe("/orgs/acme");
    expect(orgTo(null)).toBe("/orgs");
  });

  it("keeps My community a single link; its sections live in the page tabs", () => {
    const myCommunity = buildNavItems({}).find((item) => navSlug(item) === "my-node");
    expect(myCommunity?.to).toBe("/dashboard/node");
    expect(myCommunity?.children).toBeUndefined();
    expect(isNavItemActive(myCommunity ?? { to: "" }, "/nodes/abc/content")).toBe(true);
    expect(isNavItemActive(myCommunity ?? { to: "" }, "/tenant/t1")).toBe(true);
  });

  it("hides Admin from members", () => {
    expect(flattenPaths(filterSidebarByRole(NAV_ITEMS, "member"))).not.toContain("/admin");
    expect(flattenPaths(filterSidebarByRole(NAV_ITEMS, "admin"))).toEqual(
      expect.arrayContaining(["/admin", "/admin/nodes", "/admin/relayer", "/admin/system"]),
    );
  });

  it("groups items into labelled sections", () => {
    const sections = groupSidebarItems(filterSidebarByRole(NAV_ITEMS, "admin"));
    expect(sections.map((section) => section.label)).toEqual([null, "Your community", "Manage"]);
  });
});

describe("route-aware filtering", () => {
  const manifestRoute = (route: Partial<ManifestRoute> & { id: string }): ManifestRoute => route;

  it("derives absolute paths from the generated manifest", () => {
    const routes: ManifestRoute[] = [
      manifestRoute({ id: "_public", isLayout: true, parentId: "__root" }),
      manifestRoute({ id: "_public/about", path: "/about", parentId: "_public" }),
      manifestRoute({ id: "_admin", isLayout: true }),
      manifestRoute({ id: "_admin/_dashboard", isLayout: true, parentId: "_admin" }),
      manifestRoute({
        id: "_admin/_dashboard/admin",
        path: "/admin",
        parentId: "_admin/_dashboard",
      }),
      manifestRoute({
        id: "_admin/_dashboard/admin/system",
        path: "/system",
        parentId: "_admin/_dashboard/admin",
      }),
      manifestRoute({
        id: "_authenticated/_dashboard/orgs/",
        path: "/orgs/",
        parentId: "_authenticated/_dashboard",
      }),
      manifestRoute({ id: "_public/", path: "/", isIndex: true, parentId: "_public" }),
    ];
    expect(routePathsFromManifest(routes)).toEqual(
      new Set(["/about", "/admin", "/admin/system", "/orgs"]),
    );
  });

  it("keeps every item when all routes shipped", () => {
    const full = new Set(
      flattenPaths(buildNavItems({ isAdmin: true, canCurate: true })).map((to) => to),
    );
    full.add("/admin/system");
    const filtered = filterSidebarByRoutes(buildNavItems({ isAdmin: true, canCurate: true }), full);
    expect(filtered.map((item) => item.to)).toEqual(
      buildNavItems({ isAdmin: true, canCurate: true }).map((item) => item.to),
    );
  });

  it("reduces to the public shell for a simple-level child", () => {
    const simpleChildPaths = new Set(["/", "/about", "/build", "/login", "/skill"]);
    const filtered = filterSidebarByRoutes(
      buildNavItems({ isAdmin: true, canCurate: true }),
      simpleChildPaths,
    );
    expect(filtered.map((item) => item.to)).toEqual([]);
  });

  it("drops product routes and their admin children for an advanced-level child", () => {
    const advancedChildPaths = new Set([
      "/dashboard",
      "/about",
      "/orgs",
      "/admin",
      "/admin/system",
    ]);
    const filtered = filterSidebarByRoutes(
      buildNavItems({ isAdmin: true, canCurate: true }),
      advancedChildPaths,
    );
    expect(filtered.map((item) => item.to)).toEqual(["/dashboard", "/orgs", "/admin"]);
    const admin = filtered.find((item) => item.to === "/admin");
    expect(admin?.children?.map((child) => child.to)).toEqual(["/admin", "/admin/system"]);
  });

  it("matches the organization item through its activePrefix when the link is org-scoped", () => {
    const paths = new Set(["/dashboard", "/orgs", "/about"]);
    const items = buildNavItems({ activeOrgSlug: "acme", canManageOrganization: true });
    expect(filterSidebarByRoutes(items, paths).map((item) => item.to)).toContain("/orgs/acme");
  });

  it("drops parents whose children are all pruned", () => {
    const items: SidebarItem[] = [
      {
        icon: () => null,
        label: "Admin",
        to: "/admin",
        roleRequired: "admin",
        section: "manage",
        children: [
          { icon: () => null, label: "Sites", to: "/admin/tenants", roleRequired: "admin" },
        ],
      },
      { icon: () => null, label: "Stake", to: "/stake", roleRequired: "anon" },
    ];
    const filtered = filterSidebarByRoutes(items, new Set(["/stake"]));
    expect(filtered.map((item) => item.to)).toEqual(["/stake"]);
  });

  it("returns items unfiltered when the path set is empty", () => {
    const items = buildNavItems({ isAdmin: true });
    expect(filterSidebarByRoutes(items, new Set())).toEqual(items);
  });
});

describe("active state", () => {
  it("matches Home exactly so My community is not also Home", () => {
    const home = { to: "/dashboard", exact: true };
    expect(isNavItemActive(home, "/dashboard")).toBe(true);
    expect(isNavItemActive(home, "/dashboard/node")).toBe(false);
  });

  it("treats public community pages as Explore", () => {
    const explore = { to: "/explore", activePrefixes: ["/explore", "/n/", "/activity/"] };
    expect(isNavItemActive(explore, "/n/brooklyn")).toBe(true);
    expect(isNavItemActive(explore, "/stake")).toBe(false);
  });

  it("tells Events and Onboarding apart by tab", () => {
    const events = { to: "/nodes/n1/content", search: { tab: "events" } };
    const onboarding = { to: "/nodes/n1/content", search: { tab: "onboarding" } };
    expect(isNavItemActive(events, "/nodes/n1/content", {})).toBe(true);
    expect(isNavItemActive(onboarding, "/nodes/n1/content", {})).toBe(false);
    expect(isNavItemActive(onboarding, "/nodes/n1/content", { tab: "onboarding" })).toBe(true);
  });
});

describe("team area navigation", () => {
  it("shows only the active team's areas plus area-free sections", () => {
    const paths = flattenPaths(
      filterSidebarByArea(filterSidebarByRole(NAV_ITEMS, "member"), ["stake"]),
    );

    expect(paths).toEqual(expect.arrayContaining(["/explore", "/dashboard", "/stake"]));
    expect(paths).not.toContain("/dashboard/node");
  });

  it("shows My community to a Finance-active member, matching the overview route", () => {
    const paths = flattenPaths(
      filterSidebarByArea(filterSidebarByRole(NAV_ITEMS, "member"), ["finance", "stake"]),
    );

    expect(paths).toContain("/dashboard/node");
    expect(paths).toContain("/stake");
  });

  it("leaves navigation untouched when unrestricted", () => {
    const member = filterSidebarByRole(NAV_ITEMS, "member");

    expect(filterSidebarByArea(member, null)).toEqual(member);
  });
});

describe("breadcrumbs", () => {
  const labels = (pathname: string) => crumbsFor(pathname).map((crumb) => crumb.label);

  it("translates builder and organization review pages instead of using raw route names", () => {
    const translate = (id: Parameters<typeof translateAppMessage>[0]) =>
      translateAppMessage(id, undefined, "es");
    expect(crumbsFor("/apply", {}, translate)).toEqual([{ label: "Crear una comunidad" }]);
    expect(crumbsFor("/admin/organizations", {}, translate)).toEqual([
      { label: "Administración", to: "/admin" },
      { label: "Organizaciones" },
    ]);
  });

  it("names pages instead of echoing path segments", () => {
    expect(labels("/dashboard")).toEqual(["Home"]);
    expect(labels("/discover")).toEqual(["Curation"]);
    expect(labels("/dashboard/node/proposals")).toEqual(["My community", "Proposals"]);
    expect(labels("/nodes/abc/content")).toEqual(["My community", "Events"]);
    expect(
      crumbsFor("/nodes/abc/content", { tab: "onboarding" }).map((crumb) => crumb.label),
    ).toEqual(["My community", "QR check-in"]);
    expect(labels("/tenant/t1")).toEqual(["My community", "Profile & settings"]);
    expect(labels("/settings/api-keys")).toEqual(["Settings", "API keys"]);
    expect(labels("/admin/tenants/new")).toEqual(["Admin", "Sites", "New site"]);
    expect(labels("/apply")).toEqual(["Start a community"]);
  });

  it("uses the organization name when it is known", () => {
    expect(
      crumbsFor("/orgs/acme", { orgName: (slug) => (slug === "acme" ? "Acme Co" : undefined) }),
    ).toEqual([{ label: "Organizations", to: "/orgs" }, { label: "Acme Co" }]);
  });

  it("names focused form and detail pages under their parent", () => {
    expect(crumbsFor("/nodes/abc/events/new")).toEqual([
      { label: "My community", to: "/dashboard/node" },
      { label: "Events", to: "/nodes/abc/content" },
      { label: "New event" },
    ]);
    expect(labels("/nodes/abc/events/e1/edit")).toEqual(["My community", "Events", "Edit event"]);
    expect(crumbsFor("/dashboard/node/proposals/p1")).toEqual([
      { label: "My community", to: "/dashboard/node" },
      { label: "Proposals", to: "/dashboard/node/proposals" },
      { label: "Proposal" },
    ]);
    expect(crumbsFor("/admin/nodes/n1/edit")).toEqual([
      { label: "Admin", to: "/admin" },
      { label: "Communities", to: "/admin/nodes" },
      { label: "Community", to: "/admin/nodes/n1" },
      { label: "Edit community" },
    ]);
  });

  it("links parent crumbs", () => {
    expect(crumbsFor("/orgs/new")[0]).toEqual({ label: "Organizations", to: "/orgs" });
  });
});
