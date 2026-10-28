// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { render } from "@/i18n/test-render";
import type { Organization } from "@/lib/queries/organizations";
import { OrgSwitcherMenuContent } from "./org-switcher-menu";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./use-switch-organization", () => ({
  useSwitchOrganization: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

const organization = {
  id: "org-1",
  name: "Chicago",
  slug: "chicago",
  status: "active",
} as Organization;

it("lists organizations and all organizations without a New organization item", async () => {
  render(
    <DropdownMenu open>
      <OrgSwitcherMenuContent organizations={[organization]} activeOrgId="org-1" />
    </DropdownMenu>,
  );
  expect(await screen.findByTestId("org-switcher-item-org-1")).toBeTruthy();
  expect(screen.getByTestId("org-switcher-all").getAttribute("href")).toBe("/orgs");
  expect(screen.queryByTestId("org-switcher-new")).toBeNull();
  expect(screen.queryByText("New organization")).toBeNull();
  expect(document.querySelector('a[href="/orgs/new"]')).toBeNull();
});
