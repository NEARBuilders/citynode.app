// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import type { Proposal } from "@/lib/queries/proposals";
import { NodeProposalRequest } from "./-node-proposal-details";
import { ProposalStatusBadges } from "./-proposal-summary";

const getNode = vi.fn(async ({ nodeId }: { nodeId: string }) => {
  if (nodeId === "flaky") throw new Error("network down");
  return nodeId === "usa" ? { id: "usa", name: "United States" } : null;
});

vi.mock("@/app", () => ({ useApiClient: () => ({ getNode }) }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

afterEach(cleanup);

function proposal(payload: Record<string, unknown>): Proposal {
  return {
    id: "proposal-1",
    pluginId: "node",
    entityId: String(payload.slug),
    payload: {
      kind: "city",
      name: "Denver",
      slug: "denver",
      motivation: "Monthly meetups",
      accountId: "denver.sputnik-dao.near",
      submitterAccountId: "alice.near",
      ...payload,
    },
    reviewStatus: "pending",
    applyStatus: "not_started",
    operation: "create",
    schemaVersion: "1",
    removeStatus: "not_started",
    removeError: null,
    appliedResourceId: null,
    applySteps: {},
    applyTimedOut: false,
    appliedAt: null,
    applyError: null,
    rejectionReason: null,
    removedAt: null,
    createdBy: "user-1",
    submissionCount: 1,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
  };
}

function renderRequest(value: Proposal) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NodeProposalRequest proposal={value} />
    </QueryClientProvider>,
  );
}

describe("application request summary", () => {
  it("names who asked, the parent community and the DAO without raw ids", async () => {
    renderRequest(proposal({ parentId: "usa" }));
    expect(await screen.findByText("United States")).toBeTruthy();
    expect(screen.getByText("alice.near")).toBeTruthy();
    expect(screen.getByTestId("admin-proposal-dao").textContent).toBe("denver.sputnik-dao.near");
    expect(screen.queryByText("usa")).toBeNull();
  });

  it("explains that a country has no parent", () => {
    renderRequest(proposal({ kind: "country", parentId: null }));
    expect(screen.getByText("None — this is a country")).toBeTruthy();
    expect(getNode).not.toHaveBeenCalledWith({ nodeId: null });
  });

  it("says when the parent community no longer exists", async () => {
    renderRequest(proposal({ parentId: "gone" }));
    expect(await screen.findByText("Parent community not found")).toBeTruthy();
  });

  it("reports a failed parent lookup as an error with retry, not as a missing parent", async () => {
    renderRequest(proposal({ parentId: "flaky" }));
    expect(await screen.findByText("Couldn't load the parent community.")).toBeTruthy();
    expect(screen.queryByText("Parent community not found")).toBeNull();
    const calls = getNode.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(getNode.mock.calls.length).toBeGreaterThan(calls));
  });
});

describe("application status badges", () => {
  it("shows whether an approved application was applied", () => {
    render(
      <ProposalStatusBadges
        proposal={{
          ...proposal({ parentId: "usa" }),
          reviewStatus: "approved",
          applyStatus: "applied",
        }}
      />,
    );
    expect(screen.getByTestId("admin-proposal-status").textContent).toBe("Approved");
    expect(screen.getByTestId("admin-proposal-apply-status").textContent).toBe("Applied");
  });

  it("leaves the apply badge off when a setup status already explains it", () => {
    render(
      <ProposalStatusBadges
        proposal={{
          ...proposal({ parentId: "usa" }),
          reviewStatus: "approved",
          applyStatus: "failed",
        }}
      />,
    );
    expect(screen.getByTestId("admin-proposal-setup-status")).toBeTruthy();
    expect(screen.queryByTestId("admin-proposal-apply-status")).toBeNull();
  });
});
