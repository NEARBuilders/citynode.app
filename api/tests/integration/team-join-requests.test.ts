import { ORPCError } from "@orpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authedContext, getPluginClient, teardown } from "../setup";

type Role = "owner" | "admin" | "member";
type StubTeam = { id: string; name: string; areas: string[] };
type StubOrg = {
  members: Map<string, { name: string | null; role: Role }>;
  teams: StubTeam[];
  teamMembers: Map<string, Set<string>>;
};

const orgs = new Map<string, StubOrg>();
const addCalls: Array<{ caller: string; teamId: string; userId: string }> = [];
let failAdd = false;

function callerId(context: unknown) {
  return (context as { userId?: string }).userId ?? "";
}

function orgFor(organizationId: string | undefined, caller: string) {
  const org = orgs.get(organizationId ?? "");
  if (!org?.members.has(caller)) throw new ORPCError("FORBIDDEN", { message: "Not a member" });
  return org;
}

const authStub = {
  client: (context: unknown) => ({
    listMembers: async (input: { organizationId?: string; limit?: number; offset?: number }) => {
      const organizationId = input.organizationId ?? "";
      const org = orgFor(organizationId, callerId(context));
      const members = [...org.members.entries()];
      const offset = input.offset ?? 0;
      return {
        total: members.length,
        members: members.slice(offset, offset + (input.limit ?? 100)).map(([userId, member]) => ({
          id: `member-${userId}`,
          userId,
          organizationId,
          role: member.role,
          createdAt: new Date(),
          user: { id: userId, name: member.name, email: `${userId}@example.com`, image: null },
        })),
      };
    },
    listTeams: async ({ organizationId }: { organizationId?: string }) =>
      orgFor(organizationId, callerId(context)).teams.map((team) => ({
        ...team,
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    listUserTeams: async ({ organizationId }: { organizationId?: string }) => {
      const caller = callerId(context);
      const org = orgFor(organizationId, caller);
      return org.teams
        .filter((team) => org.teamMembers.get(team.id)?.has(caller))
        .map((team) => ({ ...team, organizationId, createdAt: new Date(), updatedAt: new Date() }));
    },
    addTeamMember: async (input: { teamId: string; userId: string; organizationId?: string }) => {
      const caller = callerId(context);
      const org = orgFor(input.organizationId, caller);
      addCalls.push({ caller, teamId: input.teamId, userId: input.userId });
      if (failAdd) throw new Error("upstream down");
      const role = org.members.get(caller)?.role;
      if (role !== "owner" && role !== "admin") {
        throw new ORPCError("FORBIDDEN", { message: "member:update required" });
      }
      const members = org.teamMembers.get(input.teamId) ?? new Set<string>();
      members.add(input.userId);
      org.teamMembers.set(input.teamId, members);
      return {
        id: `tm-${input.userId}`,
        teamId: input.teamId,
        userId: input.userId,
        role: "member",
        createdAt: new Date(),
      };
    },
  }),
  router: {},
};

function as(userId: string, role?: string) {
  return getPluginClient({
    ...authedContext(userId, role),
    reqHeaders: { cookie: `better-auth.session_token=${userId}` },
  });
}

function community() {
  const id = crypto.randomUUID().slice(0, 8);
  const organizationId = `teams-${id}`;
  const org: StubOrg = {
    members: new Map([
      ["owner", { name: "Owner Person", role: "owner" }],
      ["admin", { name: "Admin Person", role: "admin" }],
      ["steward", { name: "Team Steward", role: "member" }],
      ["member", { name: "  New Member  ", role: "member" }],
      ["other", { name: "other@example.com", role: "member" }],
    ]),
    teams: [
      { id: `${id}-ops`, name: "Operations", areas: ["node-operations"] },
      { id: `${id}-community`, name: "Community", areas: ["events", "unknown-area"] },
      { id: `${id}-event`, name: "Hack Night", areas: [] },
    ],
    teamMembers: new Map([[`${id}-ops`, new Set(["steward"])]]),
  };
  orgs.set(organizationId, org);
  return {
    organizationId,
    org,
    ops: `${id}-ops`,
    communityTeam: `${id}-community`,
    event: `${id}-event`,
  };
}

beforeAll(async () => {
  await getPluginClient(undefined, { auth: authStub } as never);
}, 60_000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  addCalls.length = 0;
  failAdd = false;
});

describe("team join board", () => {
  it("lists only teams with a recognized Feature Area, with the caller's own state", async () => {
    const { organizationId, ops, communityTeam } = community();
    const board = await (await as("steward")).getTeamJoinBoard({ organizationId });
    expect(board.canReview).toBe(false);
    expect(board.teams).toEqual([
      {
        id: ops,
        name: "Operations",
        areas: ["node-operations"],
        isMember: true,
        pendingRequestId: null,
      },
      {
        id: communityTeam,
        name: "Community",
        areas: ["events"],
        isMember: false,
        pendingRequestId: null,
      },
    ]);
    expect((await (await as("owner")).getTeamJoinBoard({ organizationId })).canReview).toBe(true);
  });

  it("refuses outsiders, platform admins outside the community and anonymous callers", async () => {
    const { organizationId } = community();
    await expect((await as("outsider")).getTeamJoinBoard({ organizationId })).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
    await expect(
      (await as("platform-admin", "admin")).getTeamJoinBoard({ organizationId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await getPluginClient()).getTeamJoinBoard({ organizationId }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("asking to join a team", () => {
  it("allows one pending request per team, derived from the session", async () => {
    const { organizationId, ops } = community();
    const member = await as("member");
    const request = await member.requestToJoinTeam({
      organizationId,
      teamId: ops,
      requesterUserId: "owner",
    } as never);
    expect(request).toMatchObject({
      teamId: ops,
      teamName: "Operations",
      requesterName: "New Member",
      isMine: true,
      status: "pending",
      canDecide: false,
      canEndorse: false,
    });
    await expect(member.requestToJoinTeam({ organizationId, teamId: ops })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const board = await member.getTeamJoinBoard({ organizationId });
    expect(board.teams.find((team) => team.id === ops)?.pendingRequestId).toBe(request.id);
  });

  it("refuses Event Teams, unknown teams and teams the caller is already on", async () => {
    const { organizationId, ops, event } = community();
    await expect(
      (await as("member")).requestToJoinTeam({ organizationId, teamId: event }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      (await as("member")).requestToJoinTeam({ organizationId, teamId: "missing" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      (await as("steward")).requestToJoinTeam({ organizationId, teamId: ops }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      (await as("outsider")).requestToJoinTeam({ organizationId, teamId: ops }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets only the requester withdraw, then allows a new request", async () => {
    const { organizationId, ops } = community();
    const member = await as("member");
    const request = await member.requestToJoinTeam({ organizationId, teamId: ops });
    await expect(
      (await as("owner")).withdrawTeamJoinRequest({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await as("other")).withdrawTeamJoinRequest({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await member.withdrawTeamJoinRequest({ requestId: request.id })).status).toBe(
      "withdrawn",
    );
    await expect(member.withdrawTeamJoinRequest({ requestId: request.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await member.requestToJoinTeam({ organizationId, teamId: ops })).status).toBe(
      "pending",
    );
  });
});

describe("who sees and endorses requests", () => {
  it("shows a request to its team's members and reviewers, but not to other members", async () => {
    const { organizationId, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });

    const stewardView = await (await as("steward")).getTeamJoinBoard({ organizationId });
    expect(stewardView.requests).toEqual([
      expect.objectContaining({
        id: request.id,
        canEndorse: true,
        canDecide: false,
        isMine: false,
      }),
    ]);
    const ownerView = await (await as("owner")).getTeamJoinBoard({ organizationId });
    expect(ownerView.requests).toEqual([
      expect.objectContaining({ id: request.id, canEndorse: false, canDecide: true }),
    ]);
    expect((await (await as("other")).getTeamJoinBoard({ organizationId })).requests).toEqual([]);
    expect(JSON.stringify(ownerView)).not.toContain("@example.com");
  });

  it("lets current team members endorse once, without changing the status", async () => {
    const { organizationId, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });
    const steward = await as("steward");
    await steward.endorseTeamJoinRequest({ requestId: request.id });
    const endorsed = await steward.endorseTeamJoinRequest({ requestId: request.id });
    expect(endorsed).toMatchObject({ status: "pending", endorsementCount: 1, endorsedByMe: true });

    await expect(
      (await as("owner")).endorseTeamJoinRequest({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await as("member")).endorseTeamJoinRequest({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await as("other")).endorseTeamJoinRequest({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deciding requests", () => {
  it("adds the member upstream in the approver's context, then records the approval", async () => {
    const { organizationId, org, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });
    const approved = await (await as("admin")).decideTeamJoinRequest({
      requestId: request.id,
      decision: "approve",
    });
    expect(approved.status).toBe("approved");
    expect(addCalls).toEqual([{ caller: "admin", teamId: ops, userId: "member" }]);
    expect(org.teamMembers.get(ops)?.has("member")).toBe(true);
    const memberBoard = await (await as("member")).getTeamJoinBoard({ organizationId });
    expect(memberBoard.teams.find((team) => team.id === ops)?.isMember).toBe(true);
    await expect(
      (await as("owner")).decideTeamJoinRequest({ requestId: request.id, decision: "decline" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps the request pending when the upstream add fails", async () => {
    const { organizationId, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });
    failAdd = true;
    await expect(
      (await as("owner")).decideTeamJoinRequest({ requestId: request.id, decision: "approve" }),
    ).rejects.toMatchObject({ code: "CONNECTION_ERROR" });
    const board = await (await as("owner")).getTeamJoinBoard({ organizationId });
    expect(board.requests.find((entry) => entry.id === request.id)?.status).toBe("pending");
  });

  it("lets owners decline, and refuses plain members, team members and platform admins", async () => {
    const { organizationId, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });
    for (const [userId, role] of [
      ["member", undefined],
      ["steward", undefined],
      ["other", undefined],
      ["platform-admin", "admin"],
    ] as const) {
      await expect(
        (await as(userId, role)).decideTeamJoinRequest({
          requestId: request.id,
          decision: "approve",
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) });
    }
    expect(addCalls).toEqual([]);
    const declined = await (await as("owner")).decideTeamJoinRequest({
      requestId: request.id,
      decision: "decline",
    });
    expect(declined.status).toBe("declined");
    const mine = await (await as("member")).getTeamJoinBoard({ organizationId });
    expect(mine.requests).toEqual([
      expect.objectContaining({ id: request.id, status: "declined" }),
    ]);
  });
});

describe("closing requests that can no longer be approved", () => {
  it("closes a request whose requester left the community", async () => {
    const { organizationId, org, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });
    org.members.delete("member");
    await expect(
      (await as("owner")).decideTeamJoinRequest({ requestId: request.id, decision: "approve" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const board = await (await as("owner")).getTeamJoinBoard({ organizationId });
    expect(board.requests).toEqual([
      expect.objectContaining({
        id: request.id,
        status: "closed",
        closedReason: "requester_left",
        requesterName: "New Member",
        canDecide: false,
      }),
    ]);
    expect(addCalls).toEqual([]);
  });

  it("shows other people's closed requests to reviewers only", async () => {
    const { organizationId, org, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });
    org.members.delete("member");
    expect((await (await as("owner")).getTeamJoinBoard({ organizationId })).requests).toEqual([
      expect.objectContaining({ id: request.id, status: "closed" }),
    ]);
    expect((await (await as("steward")).getTeamJoinBoard({ organizationId })).requests).toEqual([]);
  });

  it("closes a request whose team was deleted and keeps its name for display", async () => {
    const { organizationId, org, ops } = community();
    const request = await (await as("member")).requestToJoinTeam({ organizationId, teamId: ops });
    org.teams = org.teams.filter((team) => team.id !== ops);
    await expect(
      (await as("steward")).endorseTeamJoinRequest({ requestId: request.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const board = await (await as("owner")).getTeamJoinBoard({ organizationId });
    expect(board.requests).toEqual([
      expect.objectContaining({
        status: "closed",
        closedReason: "team_deleted",
        teamName: "Operations",
        teamAreas: ["node-operations"],
      }),
    ]);
  });

  it("closes a request whose team lost its last recognized area and accepts no new ones", async () => {
    const { organizationId, org, communityTeam } = community();
    const request = await (await as("member")).requestToJoinTeam({
      organizationId,
      teamId: communityTeam,
    });
    const team = org.teams.find((candidate) => candidate.id === communityTeam);
    if (team) team.areas = ["unknown-area"];
    await expect(
      (await as("owner")).decideTeamJoinRequest({ requestId: request.id, decision: "approve" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const mine = await (await as("member")).getTeamJoinBoard({ organizationId });
    expect(mine.requests).toEqual([
      expect.objectContaining({ status: "closed", closedReason: "team_not_joinable" }),
    ]);
    expect(mine.teams.map((candidate) => candidate.id)).not.toContain(communityTeam);
    await expect(
      (await as("member")).requestToJoinTeam({ organizationId, teamId: communityTeam }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
