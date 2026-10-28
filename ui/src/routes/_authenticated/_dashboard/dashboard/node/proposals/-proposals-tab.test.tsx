// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route } from "./index";

const harness = vi.hoisted(() => ({
  routeContext: {} as Record<string, unknown>,
  getProposals: (() => Promise.resolve({ data: [] })) as (input: unknown) => Promise<unknown>,
  approve: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useRouteContext: () => harness.routeContext,
  }),
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children?: ReactNode;
    to?: string;
    params?: { proposalId?: string };
  }) => (
    <a
      {...rest}
      href={
        to === "/dashboard/node/proposals/$proposalId" ? `/proposals/${params?.proposalId}` : to
      }
    >
      {children}
    </a>
  ),
}));

vi.mock("@/app", () => ({
  useApiClient: () => ({
    proposals: {
      getProposals: (input: unknown) => harness.getProposals(input),
      approve: harness.approve,
      reject: vi.fn(),
    },
  }),
}));

const NODE = { id: "node-1", name: "Example City" };

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  harness.getProposals = () => Promise.resolve({ data: [] });
  harness.approve.mockReset();
  for (const client of clients.splice(0)) client.clear();
});

function renderTab({ canReview = false } = {}) {
  harness.routeContext = { selectedNode: NODE, canReview };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const Component = (Route as unknown as { options: { component: ComponentType } }).options
    .component;
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
}

function application(id: string, reviewStatus: "pending" | "approved") {
  const at = "2026-10-20T10:00:00.000Z";
  return {
    id,
    reviewStatus,
    applyStatus: "not_started",
    payload: { name: `Sub community ${id}` },
    createdAt: at,
    updatedAt: at,
    rejectionReason: null,
  };
}

describe("community Proposals tab", () => {
  it("shows a plain member with no records the DAO note, an empty applications list and the propose action", async () => {
    renderTab();
    expect(await screen.findByText("No community applications yet")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.dao-proposals-note").textContent).toContain(
      "can't submit proposals",
    );
    expect(screen.getByRole("heading", { name: "Community applications" })).toBeTruthy();
    expect(screen.queryByText("No proposals yet")).toBeNull();
    const propose = screen.getByRole("link", { name: "Propose a sub-community" });
    expect(propose.getAttribute("href")).toBe("/apply");
  });

  it("lists platform records as applications with detail links and no review actions for members", async () => {
    harness.getProposals = () =>
      Promise.resolve({ data: [application("a1", "pending"), application("a2", "approved")] });
    renderTab();
    expect(await screen.findByText("Sub community a1")).toBeTruthy();
    expect(screen.getByText("Sub community a2")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.proposal-details-a1").getAttribute("href")).toBe(
      "/proposals/a1",
    );
    expect(screen.queryByTestId("dashboard-node.proposal-approve-a1")).toBeNull();
    expect(screen.getByTestId("dashboard-node.dao-proposals-note")).toBeTruthy();
  });

  it("keeps the approve action for reviewers", async () => {
    harness.getProposals = () => Promise.resolve({ data: [application("a1", "pending")] });
    harness.approve.mockResolvedValue({});
    renderTab({ canReview: true });
    const approve = await screen.findByTestId("dashboard-node.proposal-approve-a1");
    fireEvent.click(approve);
    await waitFor(() =>
      expect(harness.approve).toHaveBeenCalledWith({
        pluginId: "api",
        entityId: NODE.id,
        expectedUpdatedAt: "2026-10-20T10:00:00.000Z",
      }),
    );
  });

  it("shows a failed read as an error with retry, never as an empty list", async () => {
    let calls = 0;
    harness.getProposals = () => {
      calls += 1;
      return Promise.reject(new Error("offline"));
    };
    renderTab();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load proposals.");
    expect(screen.queryByText("No community applications yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls).toBe(2));
  });
});
