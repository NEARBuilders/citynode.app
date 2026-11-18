// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import { render } from "@/i18n/test-render";
import type { Proposal } from "@/lib/queries/proposals";
import { NodeProposalRequest } from "./-node-proposal-details";
import { ProposalStatusCell } from "./-proposal-columns";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    "data-testid": testId,
  }: {
    children: ReactNode;
    params?: { slug?: string };
    "data-testid"?: string;
  }) => (
    <a href={`/n/${params?.slug ?? ""}`} data-testid={testId}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function proposal(payload: Record<string, unknown>): Proposal {
  return {
    id: "proposal-1",
    pluginId: "node",
    entityId: String(payload.slug),
    payload: {
      placeId: "33333333-3333-4333-8333-333333333333",
      name: "Denver",
      slug: "denver",
      motivation: "Monthly meetups",
      accountId: "denver.sputnik-dao.near",
      submitterAccountId: "alice.near",
      ...payload,
    },
    reviewStatus: "pending",
    operation: "create",
    schemaVersion: "1",
    rejectionReason: null,
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
  it("names who asked, the community and the DAO to link", () => {
    renderRequest(proposal({}));
    expect(screen.getByText("alice.near")).toBeTruthy();
    expect(screen.getByTestId("admin-proposal-community").getAttribute("href")).toBe("/n/denver");
    expect(screen.getByTestId("admin-proposal-dao").textContent).toBe("denver.sputnik-dao.near");
  });

  it("still shows an application saved before the cutover", () => {
    renderRequest(proposal({ placeId: undefined, kind: "city", parentId: "usa" }));
    expect(screen.getByTestId("admin-proposal-community").textContent).toBe("Denver");
  });

  it("shows an approved application as approved", () => {
    render(
      <ProposalStatusCell
        proposal={{ ...proposal({}), reviewStatus: "approved" }}
        t={translateEnglishAppMessage}
      />,
    );
    expect(screen.getByTestId("admin-proposal-status").textContent).toBe("Approved");
  });
});
