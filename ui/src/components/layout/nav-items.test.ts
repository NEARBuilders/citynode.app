import { describe, expect, it } from "vitest";
import { filterSidebarByRole, NAV_ITEMS } from "./nav-items";

describe("node dashboard navigation", () => {
  it("shows My Node to authenticated members and admins only", () => {
    const anonymousPaths = filterSidebarByRole(NAV_ITEMS, "anon").map((item) => item.to);
    const memberPaths = filterSidebarByRole(NAV_ITEMS, "member").map((item) => item.to);
    const adminPaths = filterSidebarByRole(NAV_ITEMS, "admin").map((item) => item.to);

    expect(anonymousPaths).not.toContain("/dashboard/node");
    expect(memberPaths).toContain("/dashboard/node");
    expect(adminPaths).toContain("/dashboard/node");
  });
});
