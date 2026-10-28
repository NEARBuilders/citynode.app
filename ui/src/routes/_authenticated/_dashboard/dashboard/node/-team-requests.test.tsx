// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { TeamRequests } from "./-team-requests";

const api = vi.hoisted(() => ({
  getTeamJoinBoard: vi.fn(),
  requestToJoinTeam: vi.fn(),
  withdrawTeamJoinRequest: vi.fn(),
  endorseTeamJoinRequest: vi.fn(),
  decideTeamJoinRequest: vi.fn(),
}));

vi.mock("@/app", () => ({ useApiClient: () => api }));

const ops = { id: "team-ops", name: "Operations", areas: ["node-operations"] };
const community = { id: "team-community", name: "Community", areas: ["events", "finance"] };

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    teamId: ops.id,
    teamName: ops.name,
    teamAreas: ops.areas,
    requesterName: "New Member",
    isMine: false,
    status: "pending",
    closedReason: null,
    endorsementCount: 0,
    endorsedByMe: false,
    canEndorse: false,
    canDecide: false,
    createdAt: "2026-10-28T10:00:00.000Z",
    decidedAt: null,
    ...overrides,
  };
}

function renderTeams() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TeamRequests organizationId="org-1" />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("Teams on Overview", () => {
  it("lets a member ask to join, with each team's Feature Areas", async () => {
    api.getTeamJoinBoard.mockResolvedValue({
      canReview: false,
      teams: [
        { ...ops, isMember: false, pendingRequestId: null },
        { ...community, isMember: false, pendingRequestId: "request-2" },
      ],
      requests: [request({ id: "request-2", teamId: community.id, isMine: true })],
    });
    api.requestToJoinTeam.mockResolvedValue(request());
    renderTeams();

    const opsRow = await screen.findByTestId("dashboard-node.team-team-ops");
    expect(opsRow.textContent).toContain("Node operations");
    expect(screen.getByTestId("dashboard-node.team-team-community").textContent).toContain(
      "Request sent",
    );
    expect(screen.getByTestId("dashboard-node.team-team-community").textContent).toContain(
      "Finance",
    );
    expect(screen.queryByTestId("dashboard-node.team-requests")).toBeNull();
    expect(screen.queryByTestId("dashboard-node.team-requests-empty")).toBeNull();

    fireEvent.click(screen.getByTestId("dashboard-node.team-ask-team-ops"));
    await waitFor(() =>
      expect(api.requestToJoinTeam).toHaveBeenCalledWith({
        organizationId: "org-1",
        teamId: "team-ops",
      }),
    );
    await waitFor(() => expect(api.getTeamJoinBoard).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTestId("dashboard-node.team-withdraw-team-community"));
    await waitFor(() =>
      expect(api.withdrawTeamJoinRequest).toHaveBeenCalledWith({ requestId: "request-2" }),
    );
  });

  it("shows no action on a team the member is already on, and their closed requests", async () => {
    api.getTeamJoinBoard.mockResolvedValue({
      canReview: false,
      teams: [{ ...ops, isMember: true, pendingRequestId: null }],
      requests: [
        request({
          id: "request-3",
          isMine: true,
          status: "closed",
          closedReason: "team_not_joinable",
          teamName: "Old team",
        }),
      ],
    });
    renderTeams();

    const row = await screen.findByTestId("dashboard-node.team-team-ops");
    expect(row.textContent).toContain("You're on this team");
    expect(row.querySelector("button")).toBeNull();
    expect(screen.getByTestId("dashboard-node.own-team-requests").textContent).toContain(
      "Your request to join Old team:",
    );
    expect(screen.getByTestId("dashboard-node.team-request-closed-request-3").textContent).toBe(
      "The team no longer takes requests",
    );
  });

  it("lets a team member endorse, without approve or decline", async () => {
    api.getTeamJoinBoard.mockResolvedValue({
      canReview: false,
      teams: [{ ...ops, isMember: true, pendingRequestId: null }],
      requests: [request({ canEndorse: true, endorsementCount: 1 })],
    });
    api.endorseTeamJoinRequest.mockResolvedValue(request());
    renderTeams();

    const row = await screen.findByTestId("dashboard-node.team-request-request-1");
    expect(row.textContent).toContain("New Member asked to join Operations");
    expect(
      screen.getByTestId("dashboard-node.team-request-endorsements-request-1").textContent,
    ).toBe("1 endorsement");
    expect(screen.queryByTestId("dashboard-node.team-request-approve-request-1")).toBeNull();
    fireEvent.click(screen.getByTestId("dashboard-node.team-request-endorse-request-1"));
    await waitFor(() =>
      expect(api.endorseTeamJoinRequest).toHaveBeenCalledWith({ requestId: "request-1" }),
    );
  });

  it("lets an owner approve or decline, and shows the error when approval fails", async () => {
    api.getTeamJoinBoard.mockResolvedValue({
      canReview: true,
      teams: [{ ...ops, isMember: false, pendingRequestId: null }],
      requests: [
        request({ canDecide: true, endorsementCount: 2, requesterName: null }),
        request({
          id: "request-closed",
          status: "closed",
          closedReason: "requester_left",
        }),
      ],
    });
    api.decideTeamJoinRequest.mockRejectedValueOnce(new Error("upstream down"));
    renderTeams();

    const row = await screen.findByTestId("dashboard-node.team-request-request-1");
    expect(row.textContent).toContain("Unnamed member asked to join Operations");
    expect(row.textContent).toContain("2 endorsements");
    expect(
      screen.getByTestId("dashboard-node.team-request-closed-request-closed").textContent,
    ).toBe("They left the community");
    expect(screen.queryByTestId("dashboard-node.team-request-approve-request-closed")).toBeNull();

    fireEvent.click(screen.getByTestId("dashboard-node.team-request-approve-request-1"));
    await screen.findByTestId("dashboard-node.team-action-error");
    expect(api.decideTeamJoinRequest).toHaveBeenCalledWith({
      requestId: "request-1",
      decision: "approve",
    });

    api.decideTeamJoinRequest.mockResolvedValueOnce(request({ status: "declined" }));
    fireEvent.click(screen.getByTestId("dashboard-node.team-request-decline-request-1"));
    await waitFor(() =>
      expect(api.decideTeamJoinRequest).toHaveBeenLastCalledWith({
        requestId: "request-1",
        decision: "decline",
      }),
    );
  });

  it("tells owners when nothing is waiting and members when no team is open", async () => {
    api.getTeamJoinBoard.mockResolvedValue({ canReview: true, teams: [], requests: [] });
    renderTeams();
    expect((await screen.findByTestId("dashboard-node.teams-empty")).textContent).toBe(
      "No teams are open to requests yet.",
    );
    expect(screen.getByTestId("dashboard-node.team-requests-empty").textContent).toBe(
      "No team requests waiting.",
    );
  });

  it("keeps loading and a retryable error apart from empty states", async () => {
    let fail = true;
    api.getTeamJoinBoard.mockImplementation(async () => {
      if (fail) throw new Error("down");
      return { canReview: false, teams: [], requests: [] };
    });
    renderTeams();
    expect(screen.getByTestId("dashboard-node.teams-loading")).toBeTruthy();
    await screen.findByTestId("dashboard-node.teams-error");
    expect(screen.queryByTestId("dashboard-node.teams-empty")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByTestId("dashboard-node.teams-retry"));
    await screen.findByTestId("dashboard-node.teams-empty");
  });
});
