// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarTeamSwitcher } from "./sidebar-team-switcher";

const teams = [
  { id: "team-fin", name: "Finance", areas: ["finance"] },
  { id: "team-ops", name: "Node Operator", areas: ["node-operations"] },
];

function renderSwitcher(props: Partial<Parameters<typeof SidebarTeamSwitcher>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <SidebarProvider>
      <SidebarTeamSwitcher
        teams={teams}
        activeTeamId="team-ops"
        isPending={false}
        onSelect={onSelect}
        {...props}
      />
    </SidebarProvider>,
  );
  return { onSelect };
}

function openMenu() {
  fireEvent.click(screen.getByTestId("team-switcher"));
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

describe("SidebarTeamSwitcher", () => {
  it("renders nothing when the user has no teams in the organization", () => {
    renderSwitcher({ teams: [] });

    expect(screen.queryByTestId("team-switcher")).toBeNull();
  });

  it("shows the active team, or all areas when none is active", () => {
    renderSwitcher();
    expect(screen.getByTestId("team-switcher").textContent).toContain("Node Operator");
    cleanup();

    renderSwitcher({ activeTeamId: null });
    expect(screen.getByTestId("team-switcher").textContent).toContain("All areas");
  });

  it("lists the user's teams, marks the active one and switches on select", async () => {
    const { onSelect } = renderSwitcher();
    openMenu();

    expect(
      (await screen.findByTestId("team-switcher-item-team-ops")).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByTestId("team-switcher-item-team-fin").getAttribute("aria-checked")).toBe(
      "false",
    );

    fireEvent.click(screen.getByTestId("team-switcher-item-team-fin"));
    expect(onSelect).toHaveBeenCalledWith("team-fin");
  });

  it("clears the active team from the all areas option", async () => {
    const { onSelect } = renderSwitcher();
    openMenu();

    fireEvent.click(await screen.findByTestId("team-switcher-item-all"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
