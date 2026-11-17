import { describe, expect, it } from "vitest";
import { translateAppMessage } from "@/i18n/runtime";
import { areasForPath } from "@/lib/team-workspace";
import { crumbsFor } from "./breadcrumbs";
import {
  buildNavItems,
  filterSidebarByRole,
  filterSidebarByRoutes,
  groupSidebarItems,
  isDocsPath,
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

function sidebar(context: Parameters<typeof buildNavItems>[0], role: "anon" | "member" | "admin") {
  return filterSidebarByRole(buildNavItems(context), role);
}

function childSlugs(items: SidebarItem[], slug: string): string[] {
  const item = items.find((candidate) => navSlug(candidate) === slug);
  return (item?.children ?? []).map(navSlug);
}

describe("sidebar per persona", () => {
  it("shows a signed-out visitor Explore and Stake", () => {
    expect(sidebar({}, "anon").map(navSlug)).toEqual(["explore", "stake"]);
  });

  it("shows a member Home, My community, Explore and Stake", () => {
    expect(sidebar({ hasOrganization: true }, "member").map(navSlug)).toEqual([
      "dashboard",
      "my-node",
      "explore",
      "stake",
    ]);
  });

  it("offers Start a community instead of My community to people without one", () => {
    expect(sidebar({ hasOrganization: false }, "member").map(navSlug)).toEqual([
      "dashboard",
      "start-community",
      "explore",
      "stake",
    ]);
    expect(sidebar({ hasOrganization: false, isAdmin: true }, "admin").map(navSlug)).not.toContain(
      "start-community",
    );
  });

  it("folds Organization into My community for owners and organizers", () => {
    const items = sidebar({ hasOrganization: true }, "member");
    expect(items.map(navSlug)).not.toContain("orgs");
    const myCommunity = items.find((item) => navSlug(item) === "my-node");
    expect(isNavItemActive(myCommunity ?? { to: "" }, "/orgs/acme")).toBe(true);
    expect(isNavItemActive(myCommunity ?? { to: "" }, "/orgs")).toBe(true);
  });

  it("puts Directory under Admin for curators, opening it directly", () => {
    const items = sidebar({ hasOrganization: true, canCurate: true }, "member");
    expect(items.map(navSlug)).toEqual(["dashboard", "my-node", "explore", "stake", "admin"]);
    expect(childSlugs(items, "admin")).toEqual(["discover"]);
    expect(items.find((item) => navSlug(item) === "admin")?.to).toBe("/discover");
    expect(
      sidebar({ hasOrganization: true, canCurate: false }, "member").map(navSlug),
    ).not.toContain("admin");
  });

  it("gives platform admins Communities, Events, Reports, Proposals, Directory and one Platform item", () => {
    const items = sidebar({ hasOrganization: true, isAdmin: true }, "admin");
    expect(items.map(navSlug)).toEqual(["dashboard", "my-node", "explore", "stake", "admin"]);
    expect(childSlugs(items, "admin")).toEqual([
      "admin-nodes",
      "admin-events",
      "admin-reports",
      "admin-proposals",
      "discover",
      "admin-platform",
    ]);
    const admin = items.find((item) => navSlug(item) === "admin")?.children ?? [];
    expect(childSlugs(admin, "admin-platform")).toEqual([
      "admin-stations",
      "admin-tenants",
      "admin-relayer",
      "admin-system",
    ]);
    expect(flattenSlugs(items)).not.toContain("admin-overview");
  });

  it("keeps every page the old sidebar linked to within reach", () => {
    const paths = flattenPaths(sidebar({ hasOrganization: true, isAdmin: true }, "admin"));
    expect(paths).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/dashboard/node",
        "/explore",
        "/stake",
        "/discover",
        "/admin/nodes",
        "/admin/events",
        "/admin/proposals",
        "/admin/stations",
        "/admin/tenants",
        "/admin/relayer",
        "/admin/system",
      ]),
    );
    expect(paths).not.toContain("/admin");
  });

  it("keeps Admin and Platform open on the pages under them", () => {
    const admin = NAV_ITEMS.find((item) => navSlug(item) === "admin");
    const platform = admin?.children?.find((item) => navSlug(item) === "admin-platform");
    expect(isNavItemActive(admin ?? { to: "" }, "/admin/reports")).toBe(true);
    expect(isNavItemActive(admin ?? { to: "" }, "/discover")).toBe(true);
    expect(isNavItemActive(platform ?? { to: "" }, "/admin/relayer")).toBe(true);
    expect(isNavItemActive(platform ?? { to: "" }, "/admin/reports")).toBe(false);
  });

  it("keeps My community a single link; its sections live in the page tabs", () => {
    const myCommunity = buildNavItems({}).find((item) => navSlug(item) === "my-node");
    expect(myCommunity?.to).toBe("/dashboard/node");
    expect(myCommunity?.children).toBeUndefined();
    expect(isNavItemActive(myCommunity ?? { to: "" }, "/nodes/abc/content")).toBe(true);
    expect(isNavItemActive(myCommunity ?? { to: "" }, "/tenant/t1")).toBe(true);
  });

  it("hides Admin from members", () => {
    expect(flattenPaths(filterSidebarByRole(buildNavItems({}), "member"))).not.toContain(
      "/admin/nodes",
    );
  });

  it("groups items into one unlabelled section and Manage", () => {
    const sections = groupSidebarItems(filterSidebarByRole(NAV_ITEMS, "admin"));
    expect(sections.map((section) => section.label)).toEqual([null, "Manage"]);
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
    const simpleChildPaths = new Set(["/", "/about", "/login", "/skill"]);
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
    expect(filtered.map(navSlug)).toEqual(["dashboard", "my-node", "admin"]);
    const admin = filtered.find((item) => navSlug(item) === "admin");
    expect(admin?.children?.map(navSlug)).toEqual(["admin-platform"]);
    expect(admin?.children?.[0]?.children?.map((child) => child.to)).toEqual(["/admin/system"]);
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

describe("docs pages", () => {
  it("treats the overview, builder pages and the agent skill as docs", () => {
    expect(isDocsPath("/docs")).toBe(true);
    expect(isDocsPath("/docs/build")).toBe(true);
    expect(isDocsPath("/skill")).toBe(true);
    expect(isDocsPath("/docsearch")).toBe(false);
    expect(isDocsPath("/skill.md")).toBe(false);
  });

  it("chains the agent skill under Docs and Builders", () => {
    expect(crumbsFor("/skill").map((crumb) => [crumb.label, crumb.to])).toEqual([
      ["Docs", "/docs"],
      ["Builders", "/docs/build"],
      ["Agent skill", undefined],
    ]);
    expect(crumbsFor("/docs").map((crumb) => crumb.label)).toEqual(["Docs"]);
    expect(crumbsFor("/docs/build").map((crumb) => crumb.label)).toEqual(["Docs", "Builders"]);
    expect(
      crumbsFor("/docs/run-a-community", {
        guideTitle: (slug) => (slug === "run-a-community" ? "Dirigir una comunidad" : undefined),
      }).map((crumb) => crumb.label),
    ).toEqual(["Docs", "Dirigir una comunidad"]);
  });
});

describe("team area navigation", () => {
  it("keeps every member sidebar destination outside the team area filter", () => {
    const items = filterSidebarByRole(
      buildNavItems({
        hasOrganization: true,
        canCurate: true,
        isAdmin: true,
      }),
      "admin",
    );
    const paths = flattenPaths(items);

    expect(paths).toEqual(expect.arrayContaining(["/dashboard/node", "/stake"]));
    for (const path of paths) expect(areasForPath(path)).toBeNull();
  });
});

describe("breadcrumbs", () => {
  const labels = (pathname: string) => crumbsFor(pathname).map((crumb) => crumb.label);

  it("translates app pages instead of using raw route names", () => {
    const translate = (id: Parameters<typeof translateAppMessage>[0]) =>
      translateAppMessage(id, undefined, "es");
    expect(crumbsFor("/apply", {}, translate)).toEqual([{ label: "Crear una comunidad" }]);
    expect(crumbsFor("/onboarding/station/abc", {}, translate)).toEqual([{ label: "Estación" }]);
    expect(crumbsFor("/admin/tenants", {}, translate)).toEqual([
      { label: "Administración" },
      { label: "Plataforma" },
      { label: "Dominios" },
    ]);
  });

  it("names pages instead of echoing path segments", () => {
    expect(labels("/dashboard")).toEqual(["Home"]);
    expect(labels("/discover")).toEqual(["Admin", "Directory"]);
    expect(labels("/admin/reports")).toEqual(["Admin", "Reports"]);
    expect(labels("/admin/events")).toEqual(["Admin", "Events"]);
    expect(labels("/admin/stations")).toEqual(["Admin", "Platform", "Stations"]);
    expect(labels("/admin/relayer")).toEqual(["Admin", "Platform", "Relayer"]);
    expect(labels("/admin/system")).toEqual(["Admin", "Platform", "System"]);
    expect(labels("/me")).toEqual(["Your activity"]);
    expect(labels("/dashboard/node/proposals")).toEqual(["My community", "Proposals"]);
    expect(labels("/nodes/abc/content")).toEqual(["My community", "Events"]);
    expect(labels("/report")).toEqual(["Reports"]);
    expect(labels("/nodes/abc/reports/2026-11")).toEqual(["Reports", "Monthly report"]);
    expect(labels("/nodes/abc/events/e1/report")).toEqual(["Reports", "Event report"]);
    expect(
      crumbsFor("/nodes/abc/content", { tab: "onboarding" }).map((crumb) => crumb.label),
    ).toEqual(["My community", "Stations"]);
    expect(labels("/tenant/t1")).toEqual(["My community", "Community settings"]);
    expect(labels("/settings/profile")).toEqual(["Settings", "Your profile"]);
    expect(labels("/settings/api-keys")).toEqual(["Settings", "API keys"]);
    expect(labels("/admin/tenants")).toEqual(["Admin", "Platform", "Domains"]);
    expect(labels("/onboarding/station/abc")).toEqual(["Station"]);
    expect(labels("/admin/proposals/new")).toEqual(["Admin", "Proposals", "New proposal"]);
    expect(labels("/apply")).toEqual(["Start a community"]);
  });

  it("uses the organization name when it is known", () => {
    expect(
      crumbsFor("/orgs/acme", { orgName: (slug) => (slug === "acme" ? "Acme Co" : undefined) }),
    ).toEqual([
      { label: "My community", to: "/dashboard/node" },
      { label: "Organizations", to: "/orgs" },
      { label: "Acme Co" },
    ]);
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
      { label: "Admin" },
      { label: "Communities", to: "/admin/nodes" },
      { label: "Community", to: "/admin/nodes/n1" },
      { label: "Edit community" },
    ]);
  });

  it("links parent crumbs", () => {
    expect(crumbsFor("/orgs/new")[1]).toEqual({ label: "Organizations", to: "/orgs" });
  });
});
