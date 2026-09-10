import { describe, expect, it } from "vitest";
import { filterSidebarByRole, NAV_ITEMS, type SidebarItem } from "./nav-items";

function flattenPaths(items: SidebarItem[]): string[] {
  return items.flatMap((item) => [item.to, ...(item.children ? flattenPaths(item.children) : [])]);
}

describe("node dashboard navigation", () => {
  it("shows My Node to authenticated members and admins only", () => {
    const anonymousPaths = flattenPaths(filterSidebarByRole(NAV_ITEMS, "anon"));
    const memberPaths = flattenPaths(filterSidebarByRole(NAV_ITEMS, "member"));
    const adminPaths = flattenPaths(filterSidebarByRole(NAV_ITEMS, "admin"));

    expect(anonymousPaths).not.toContain("/dashboard/node");
    expect(memberPaths).toContain("/dashboard/node");
    expect(adminPaths).toContain("/dashboard/node");
  });

  it("shows Things and New Thing to signed-in members and admins only", () => {
    const anonymousPaths = flattenPaths(filterSidebarByRole(NAV_ITEMS, "anon"));
    const memberPaths = flattenPaths(filterSidebarByRole(NAV_ITEMS, "member"));
    const adminPaths = flattenPaths(filterSidebarByRole(NAV_ITEMS, "admin"));

    expect(anonymousPaths).not.toContain("/things");
    expect(anonymousPaths).not.toContain("/things/new");
    expect(memberPaths).toEqual(expect.arrayContaining(["/things", "/things/new"]));
    expect(adminPaths).toEqual(expect.arrayContaining(["/things", "/things/new"]));
  });

  it("keeps the My Node sub-item under the Dashboard parent", () => {
    const dashboard = filterSidebarByRole(NAV_ITEMS, "member").find(
      (item) => item.to === "/dashboard",
    );
    expect(dashboard?.children?.map((child) => child.to)).toEqual([
      "/dashboard",
      "/dashboard/node",
    ]);
  });

  it("keeps the New Thing sub-item under the Things parent", () => {
    const things = filterSidebarByRole(NAV_ITEMS, "member").find((item) => item.to === "/things");
    expect(things?.children?.map((child) => child.to)).toEqual(["/things", "/things/new"]);
  });

  it("filters restricted children out of an allowed parent", () => {
    const dashboard = filterSidebarByRole(NAV_ITEMS, "anon").find(
      (item) => item.to === "/dashboard",
    );
    expect(dashboard?.children?.map((child) => child.to)).toEqual(["/dashboard"]);
  });
});
