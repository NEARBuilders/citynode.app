// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { NodeStakeSection } from "./node-stake-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string;
    search?: { nodeId?: string };
    children?: ReactNode;
  }) => (
    <a href={search?.nodeId ? `${to}?nodeId=${search.nodeId}` : to} {...rest}>
      {children}
    </a>
  ),
}));

const node = {
  id: "state",
  name: "Illinois",
  slug: "illinois",
  kind: "state" as const,
  parentId: "country",
  tenantId: "tenant",
  metadata: {},
  createdAt: "2026-09-10",
  updatedAt: "2026-09-10",
};
const source = {
  ...node,
  id: "country",
  name: "USA",
  slug: "usa",
  kind: "country" as const,
  parentId: null,
};
const validator = {
  id: "validator",
  nodeId: "state",
  accountId: "pool.example",
  network: "mainnet",
  protocol: "other",
  role: "official" as const,
  isDefault: true,
  metadata: {},
  createdAt: "2026-09-10",
  updatedAt: "2026-09-10",
};
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

function show(props: Partial<ComponentProps<typeof NodeStakeSection>> = {}) {
  const client = new QueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <NodeStakeSection node={node} validators={[]} via={null} {...props} />
    </QueryClientProvider>,
  );
}

describe("public node staking", () => {
  it("shows no stake link when neither the node nor an ancestor has a validator", () => {
    show();
    expect(screen.getByText("This node doesn't run a validator yet.")).toBeTruthy();
    expect(screen.queryByTestId("node-stake-link")).toBeNull();
  });

  it("links to the node's own pools", () => {
    show({ validators: [validator] });
    expect(screen.getByText("Back Illinois by staking NEAR to its validator.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Stake to Illinois" }).getAttribute("href")).toBe(
      "/stake?nodeId=state",
    );
    expect(screen.getByRole("heading", { name: "pool.example" })).toBeTruthy();
  });

  it("labels an ancestor's pools with the ancestor's name", () => {
    show({ validators: [{ ...validator, nodeId: "country" }], via: source });
    expect(screen.getByText("Illinois uses the validator from USA.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Stake via USA" }).getAttribute("href")).toBe(
      "/stake?nodeId=state",
    );
    expect(screen.getByRole("heading", { name: "pool.example" })).toBeTruthy();
  });
});
