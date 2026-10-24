// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { StakeDirectory } from "./-stake-directory";
import { StakeNoValidator } from "./-stake-no-validator";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params: _params,
    search: _search,
    ...props
  }: {
    to: string;
    params?: unknown;
    search?: unknown;
    children?: ReactNode;
  }) => <a href={to} {...props} />,
}));

afterEach(cleanup);

const node = { kind: "city", hostname: null };

describe("StakeDirectory", () => {
  it("flags communities that have no validator yet", () => {
    render(
      <StakeDirectory
        gateway="citynode.app"
        isLoading={false}
        nodes={[
          { ...node, id: "a", name: "Staked", slug: "staked", stakeable: true },
          { ...node, id: "b", name: "Testing", slug: "testing", stakeable: false },
        ]}
      />,
    );
    expect(screen.queryByTestId("stake.no-validator-staked")).toBeNull();
    expect(screen.getByTestId("stake.no-validator-testing").textContent).toBe("No validator yet");
  });
});

describe("StakeNoValidator", () => {
  it("offers a way to explore other communities", () => {
    render(<StakeNoValidator name="Testing" childNodes={[]} />);
    expect(screen.getByText("Testing doesn't have a validator yet")).toBeTruthy();
    const link = screen.getByTestId("stake.explore-communities");
    expect(link.getAttribute("href")).toBe("/explore");
    expect(link.textContent).toContain("Explore communities");
  });
});
