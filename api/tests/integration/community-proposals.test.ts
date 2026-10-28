import { ORPCError } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authedContext, getPluginClient, teardown } from "../setup";

const proposals = new Map<string, Record<string, unknown>>();
const applicant = "community-applicant.near";
const savedAt = "2026-09-10T00:00:00.000Z";

function savedProposal(
  id: string,
  slug: string,
  options?: {
    orgId?: string;
    createdBy?: string;
    submitterAccountId?: string;
    status?: string;
    applyStatus?: string;
    updatedAt?: string;
    applicantUserId?: string | null;
  },
) {
  return {
    id,
    pluginId: "node",
    entityId: slug,
    updatedAt: options?.updatedAt ?? savedAt,
    createdBy: options?.createdBy ?? applicant,
    reviewStatus: options?.status ?? "approved",
    applyStatus: options?.applyStatus ?? "applying",
    applySteps: {},
    payload: {
      kind: "country",
      parentId: null,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      slug,
      motivation: "Serve the local community",
      accountId: `${slug}.sputnik-dao.near`,
      submitterAccountId: options?.submitterAccountId ?? applicant,
      ...(options?.applicantUserId === null
        ? {}
        : { applicantUserId: options?.applicantUserId ?? "user-applicant" }),
      ...(options?.orgId ? { orgId: options.orgId } : {}),
    },
  };
}

type RecordedStep = {
  pluginId?: string;
  entityId: string;
  step: string;
  status: string;
  resourceId?: string;
};

type FakeMember = {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
};

type FakeTeam = {
  id: string;
  name: string;
  organizationId: string;
  areas: string[];
};

type FakeOrganization = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "pending" | "rejected";
  requestedBy: string | null;
  metadata: Record<string, unknown>;
  members: FakeMember[];
  invitations: FakeInvitation[];
  teams: FakeTeam[];
};

type FakeInvitation = {
  id: string;
  organizationId: string;
  email: string | null;
  role: string | null;
  status: string;
  expiresAt: Date;
  inviterId: string;
  teamId: string | null;
  nearAccountId: string | null;
  nearNetwork: "mainnet" | "testnet" | null;
};

const organizations = new Map<string, FakeOrganization>();
let memberCounter = 0;
let teamCounter = 0;
let invitationCounter = 0;

const fakeNow = () => new Date("2026-09-10T00:00:00.000Z");

function findOrganization(organizationId?: string, organizationSlug?: string) {
  for (const organization of organizations.values()) {
    if (
      organizationId ? organization.id === organizationId : organization.slug === organizationSlug
    ) {
      return organization;
    }
  }
  return undefined;
}

function fakeOrgOutput(organization: FakeOrganization) {
  return {
    ...organization,
    createdAt: fakeNow(),
    members: organization.members.map((member) => ({
      ...member,
      createdAt: fakeNow(),
      user: null,
    })),
    invitations: [...organization.invitations],
  };
}

const notFound = (message: string) => new ORPCError("NOT_FOUND", { message });

const createOrganization = vi.fn(
  async ({
    name,
    slug,
    metadata,
    requestedBy,
  }: {
    name: string;
    slug: string;
    metadata?: Record<string, unknown>;
    requestedBy: string | null;
  }) => {
    if (findOrganization(undefined, slug)) {
      throw new ORPCError("CONFLICT", { message: "The organization slug is already taken" });
    }
    const organization: FakeOrganization = {
      id: `org-${slug}`,
      name,
      slug,
      status: "pending",
      requestedBy,
      metadata: metadata ? { ...metadata } : {},
      members: [],
      invitations: [],
      teams: [],
    };
    organizations.set(organization.id, organization);
    return fakeOrgOutput(organization);
  },
);

const inviteMember = vi.fn(
  async (
    inviterId: string,
    {
      nearAccountId,
      nearNetwork,
      role,
      organizationId,
    }: {
      nearAccountId?: string;
      nearNetwork?: "mainnet" | "testnet";
      role: string;
      organizationId?: string;
    },
  ) => {
    const organization = organizations.get(organizationId ?? "");
    if (!organization) throw notFound("Organization not found");
    if (organization.status !== "active") {
      throw new ORPCError("FORBIDDEN", {
        message: "Organization requires platform-admin approval",
      });
    }
    const invitation: FakeInvitation = {
      id: `invitation-${++invitationCounter}`,
      organizationId: organization.id,
      email: `${nearAccountId}@${nearNetwork}.invite`,
      role,
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId,
      teamId: null,
      nearAccountId: nearAccountId ?? null,
      nearNetwork: nearNetwork ?? null,
    };
    organization.invitations.push(invitation);
    return invitation;
  },
);

const deleteOrganization = vi.fn(async ({ organizationId }: { organizationId: string }) => {
  organizations.delete(organizationId);
  return { success: true };
});

const recordApplyStepDefault = async (input: RecordedStep) => {
  const proposal = proposals.get(input.entityId);
  if (proposal) {
    proposal.applySteps = {
      ...(proposal.applySteps as Record<string, unknown>),
      [input.step]: {
        step: input.step,
        status: input.status,
        resourceId: input.resourceId ?? null,
      },
    };
  }
  return {};
};

const recordApplyStep = vi.fn(recordApplyStepDefault);

describe("approved community proposal provisioning", () => {
  beforeAll(async () => {
    organizations.clear();
    memberCounter = 0;
    teamCounter = 0;
    createOrganization.mockClear();
    deleteOrganization.mockClear();
    recordApplyStep.mockImplementation(recordApplyStepDefault);
    proposals.clear();
    proposals.set("chicago", savedProposal("prop-chicago", "chicago"));
    await getPluginClient(undefined, {
      proposals: {
        client: (context?: { user?: { role?: string | null } }) => ({
          getProposals: async ({ entityId }: { entityId: string }) => ({
            data: proposals.has(entityId)
              ? [
                  context?.user?.role === "admin"
                    ? proposals.get(entityId)
                    : { ...proposals.get(entityId), payload: null },
                ]
              : [],
          }),
          recordApplyStep: (input: RecordedStep) => recordApplyStep(input),
        }),
        router: {},
      },
      auth: {
        client: (context?: { user?: { id?: string; role?: string | null } }) => {
          const sessionId = context?.user?.id ?? null;
          return {
            getFullOrganization: async (input: {
              organizationId?: string;
              organizationSlug?: string;
            }) => {
              const organization = findOrganization(input.organizationId, input.organizationSlug);
              if (!organization) throw notFound("Organization not found");
              return fakeOrgOutput(organization);
            },
            checkSlug: async ({ slug }: { slug: string }) => ({
              status: !findOrganization(undefined, slug),
            }),
            createOrganization: (input: {
              name: string;
              slug: string;
              metadata?: Record<string, unknown>;
            }) => createOrganization({ ...input, requestedBy: sessionId }),
            reviewOrganization: async ({
              organizationId,
              decision,
            }: {
              organizationId: string;
              decision: "approve" | "reject";
            }) => {
              const organization = organizations.get(organizationId);
              if (!organization) throw notFound("Organization not found");
              organization.status = decision === "approve" ? "active" : "rejected";
              return fakeOrgOutput(organization);
            },
            updateOrganization: async ({
              data,
              organizationId,
            }: {
              data: { metadata?: Record<string, unknown> };
              organizationId?: string;
            }) => {
              const organization = organizations.get(organizationId ?? "");
              if (!organization) throw notFound("Organization not found");
              if (data.metadata !== undefined) {
                organization.metadata = { ...data.metadata };
              }
              return fakeOrgOutput(organization);
            },
            addMember: async ({
              userId,
              role,
              organizationId,
            }: {
              userId: string;
              role: string;
              organizationId: string;
            }) => {
              const organization = organizations.get(organizationId);
              if (!organization) throw notFound("Organization not found");
              const member: FakeMember = {
                id: `member-${++memberCounter}`,
                userId,
                organizationId,
                role,
              };
              organization.members.push(member);
              return { ...member, createdAt: fakeNow() };
            },
            updateMemberRole: async ({
              memberId,
              role,
              organizationId,
            }: {
              memberId: string;
              role: string;
              organizationId?: string;
            }) => {
              const organization = organizations.get(organizationId ?? "");
              const member = organization?.members.find((item) => item.id === memberId);
              if (!organization || !member) throw notFound("Member not found");
              member.role = role;
              return { ...member, createdAt: fakeNow(), user: null };
            },
            listMembers: async ({ organizationId }: { organizationId?: string }) => {
              const organization = organizations.get(organizationId ?? "");
              if (!organization) throw notFound("Organization not found");
              const members = organization.members.map((member) => ({
                ...member,
                createdAt: fakeNow(),
                user: null,
              }));
              return { members, total: members.length };
            },
            listTeams: async ({ organizationId }: { organizationId?: string }) => {
              const organization = organizations.get(organizationId ?? "");
              if (!organization) throw notFound("Organization not found");
              return organization.teams.map((team) => ({
                ...team,
                createdAt: fakeNow(),
                updatedAt: fakeNow(),
              }));
            },
            createTeam: async ({
              name,
              areas,
              organizationId,
            }: {
              name: string;
              areas?: string[];
              organizationId?: string;
            }) => {
              const team: FakeTeam = {
                id: `team-${++teamCounter}`,
                name,
                organizationId: organizationId ?? "",
                areas: areas ?? [],
              };
              organizations.get(organizationId ?? "")?.teams.push(team);
              return { ...team, createdAt: fakeNow(), updatedAt: fakeNow() };
            },
            listInvitations: async ({ organizationId }: { organizationId?: string }) => [
              ...(organizations.get(organizationId ?? "")?.invitations ?? []),
            ],
            inviteMember: (input: {
              nearAccountId?: string;
              nearNetwork?: "mainnet" | "testnet";
              role: string;
              organizationId?: string;
            }) => inviteMember(sessionId ?? "", input),
            listOnboardingCodes: async () => [],
            deleteOrganization: (input: { organizationId: string }) => deleteOrganization(input),
          };
        },
        router: {},
      },
    } as never);
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  it("uses the approved proposal identity and creates one linked tenant and node", async () => {
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-chicago",
      entityId: "chicago",
      hostname: "chicago.citynode.app",
    };
    const first = await admin.applyCommunityProposal(input);
    const stored = proposals.get("chicago")!;
    expect(stored.applySteps).toMatchObject({
      organization: { status: "completed", resourceId: "org-chicago" },
      community: { status: "completed", resourceId: first.nodeId },
    });
    expect(createOrganization).toHaveBeenCalledWith({
      name: "Chicago",
      slug: "chicago",
      metadata: {
        communityProposalId: "prop-chicago",
        communityApplicantId: "user-applicant",
        communityReviewerId: "platform-reviewer",
      },
      requestedBy: "platform-reviewer",
    });
    const organization = organizations.get("org-chicago")!;
    expect(organization.status).toBe("active");
    expect(organization.metadata).toMatchObject({
      communityProposalId: "prop-chicago",
      communityApplicantId: "user-applicant",
      communityReviewerId: "platform-reviewer",
    });
    expect(
      Object.fromEntries(organization.members.map((member) => [member.userId, member.role])),
    ).toEqual({ "user-applicant": "owner", "platform-reviewer": "admin" });
    expect(organization.teams.map((team) => team.name).sort()).toEqual([
      "Community",
      "Operations",
      "Treasury",
    ]);
    const node = await admin.getNode({ nodeId: first.nodeId });
    const tenant = (await admin.listTenants()).find((item) => item.id === node?.tenantId);
    expect(tenant).toMatchObject({
      orgId: "org-chicago",
      accountId: "chicago.sputnik-dao.near",
    });
    expect(first.applicantInvited).toBe(false);
    expect(organization.invitations).toEqual([]);
    const second = await admin.applyCommunityProposal(input);
    expect(second.nodeId).toBe(first.nodeId);
    expect(
      (await admin.listTenants()).filter((item) => item.accountId === "chicago.sputnik-dao.near"),
    ).toHaveLength(1);
  });

  it("rejects non-admin, pending, and tampered proposer requests before creating resources", async () => {
    const member = await getPluginClient(authedContext("ordinary-reviewer"));
    await expect(
      member.applyCommunityProposal({
        proposalId: "prop-chicago",
        entityId: "chicago",
        hostname: "chicago.citynode.app",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    proposals.set("pending", savedProposal("prop-pending", "pending", { status: "pending" }));
    proposals.set(
      "tampered",
      savedProposal("prop-tampered", "tampered", {
        createdBy: "other.near",
        submitterAccountId: applicant,
      }),
    );
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    for (const slug of ["pending", "tampered"]) {
      await expect(
        admin.applyCommunityProposal({
          proposalId: `prop-${slug}`,
          entityId: slug,
          hostname: `${slug}.citynode.app`,
        }),
      ).rejects.toBeTruthy();
    }
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "pending.sputnik-dao.near"),
    ).toBe(false);
  });

  it("preserves the legacy organization link", async () => {
    organizations.set("legacy-org", {
      id: "legacy-org",
      name: "Boston Collective",
      slug: "boston-collective",
      status: "pending",
      requestedBy: "user-applicant",
      metadata: { seeded: true },
      members: [],
      invitations: [],
      teams: [],
    });
    proposals.set("boston", savedProposal("prop-boston", "boston", { orgId: "legacy-org" }));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const applied = await admin.applyCommunityProposal({
      proposalId: "prop-boston",
      entityId: "boston",
      hostname: "boston.citynode.app",
    });
    const legacy = organizations.get("legacy-org")!;
    expect(legacy.status).toBe("active");
    expect(legacy.metadata).toMatchObject({
      seeded: true,
      communityProposalId: "prop-boston",
      communityApplicantId: "user-applicant",
      communityReviewerId: "platform-reviewer",
    });
    expect(
      Object.fromEntries(legacy.members.map((member) => [member.userId, member.role])),
    ).toEqual({ "user-applicant": "owner", "platform-reviewer": "admin" });
    const node = await admin.getNode({ nodeId: applied.nodeId });
    const tenant = (await admin.listTenants()).find((item) => item.id === node?.tenantId);
    expect(tenant?.orgId).toBe("legacy-org");
  });

  it("keeps a single resource set under concurrent apply calls", async () => {
    proposals.set("race", savedProposal("prop-race", "race"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-race",
      entityId: "race",
      hostname: "race.citynode.app",
    };
    const results = await Promise.all([
      admin.applyCommunityProposal(input),
      admin.applyCommunityProposal(input),
    ]);
    expect(results[0]?.nodeId).toBe(results[1]?.nodeId);
    expect(
      (await admin.listTenants()).filter((item) => item.accountId === "race.sputnik-dao.near"),
    ).toHaveLength(1);
  });

  it("only applies an application that an approval or retry has claimed", async () => {
    proposals.set("idle", savedProposal("prop-idle", "idle", { applyStatus: "failed" }));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    await expect(
      admin.applyCommunityProposal({
        proposalId: "prop-idle",
        entityId: "idle",
        hostname: "idle.citynode.app",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "idle.sputnik-dao.near"),
    ).toBe(false);
  });

  it("resumes after organization provisioning fails", async () => {
    proposals.set("denver", savedProposal("prop-denver", "denver"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-denver",
      entityId: "denver",
      hostname: "denver.citynode.app",
    };
    recordApplyStep.mockClear();
    createOrganization.mockRejectedValueOnce(new Error("auth unavailable"));
    await expect(admin.applyCommunityProposal(input)).rejects.toBeTruthy();
    expect(recordApplyStep).not.toHaveBeenCalled();
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "denver.sputnik-dao.near"),
    ).toBe(false);

    const resumed = await admin.applyCommunityProposal(input);
    expect(recordApplyStep.mock.calls.map(([call]) => call.step)).toEqual([
      "organization",
      "community",
    ]);
    expect(await admin.getNode({ nodeId: resumed.nodeId })).toMatchObject({ slug: "denver" });
  });

  it("reuses created resources when recording progress fails after they exist", async () => {
    proposals.set("austin", savedProposal("prop-austin", "austin"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-austin",
      entityId: "austin",
      hostname: "austin.citynode.app",
    };
    recordApplyStep.mockClear();
    recordApplyStep.mockImplementation(async (input: RecordedStep) => {
      if (input.step === "organization" || input.step === "community") {
        await recordApplyStepDefault(input);
      }
      if (input.step === "community") throw new Error("proposals unavailable");
      return {};
    });
    try {
      await expect(admin.applyCommunityProposal(input)).rejects.toBeTruthy();
    } finally {
      recordApplyStep.mockImplementation(recordApplyStepDefault);
    }
    const created = (await admin.listTenants()).filter(
      (item) => item.accountId === "austin.sputnik-dao.near",
    );
    expect(created).toHaveLength(1);

    recordApplyStep.mockClear();
    const resumed = await admin.applyCommunityProposal(input);
    const node = await admin.getNode({ nodeId: resumed.nodeId });
    expect(node?.tenantId).toBe(created[0]?.id);
    expect(recordApplyStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ step: "community", resourceId: resumed.nodeId }),
    );
  });

  it("resumes after the community was renamed and its metadata replaced", async () => {
    proposals.set("seattle", savedProposal("prop-seattle", "seattle"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-seattle",
      entityId: "seattle",
      hostname: "seattle.citynode.app",
    };
    const first = await admin.applyCommunityProposal(input);
    await admin.updateNode({
      nodeId: first.nodeId,
      name: "Emerald City",
      slug: "emerald-city",
      metadata: { kind: "country" },
    });

    const resumed = await admin.applyCommunityProposal(input);
    expect(resumed.nodeId).toBe(first.nodeId);
    expect(
      (await admin.listTenants()).filter((item) => item.accountId === "seattle.sputnik-dao.near"),
    ).toHaveLength(1);
  });

  it("removes a failed application's community and organization so it can be applied again", async () => {
    proposals.set("lagos", savedProposal("prop-lagos", "lagos"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = { proposalId: "prop-lagos", entityId: "lagos", hostname: "lagos.citynode.app" };
    await admin.applyCommunityProposal(input);
    const release = { proposalId: "prop-lagos", entityId: "lagos", expectedUpdatedAt: savedAt };

    await expect(admin.releaseCommunityProposal(release)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    {
      const failed: Record<string, unknown> | undefined = proposals.get("lagos");
      if (failed) failed.applyStatus = "failed";
    }
    const member = await getPluginClient(authedContext("ordinary-reviewer"));
    await expect(member.releaseCommunityProposal(release)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    deleteOrganization.mockClear();
    expect(await admin.releaseCommunityProposal(release)).toEqual({
      community: { released: true, keptReason: null },
      organization: { released: true, keptReason: null },
    });
    expect(deleteOrganization).toHaveBeenCalledWith({ organizationId: "org-lagos" });
    expect(organizations.has("org-lagos")).toBe(false);
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "lagos.sputnik-dao.near"),
    ).toBe(false);

    const resumable: Record<string, unknown> | undefined = proposals.get("lagos");
    if (resumable) resumable.applyStatus = "applying";
    const reapplied = await admin.applyCommunityProposal(input);
    expect(await admin.getNode({ nodeId: reapplied.nodeId })).toMatchObject({ slug: "lagos" });
  });

  it("refuses to remove resources after another admin resumed the setup", async () => {
    proposals.set("nairobi", savedProposal("prop-nairobi", "nairobi"));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    await admin.applyCommunityProposal({
      proposalId: "prop-nairobi",
      entityId: "nairobi",
      hostname: "nairobi.citynode.app",
    });
    proposals.set(
      "nairobi",
      savedProposal("prop-nairobi", "nairobi", {
        applyStatus: "applying",
        updatedAt: "2026-09-10T00:05:00.000Z",
      }),
    );
    deleteOrganization.mockClear();

    await expect(
      admin.releaseCommunityProposal({
        proposalId: "prop-nairobi",
        entityId: "nairobi",
        expectedUpdatedAt: savedAt,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/changed/) });
    expect(deleteOrganization).not.toHaveBeenCalled();
    expect(
      (await admin.listTenants()).some((item) => item.accountId === "nairobi.sputnik-dao.near"),
    ).toBe(true);
  });

  it("keeps an organization that existed before the application", async () => {
    organizations.set("legacy-accra", {
      id: "legacy-accra",
      name: "Accra Hub",
      slug: "accra-hub",
      status: "active",
      requestedBy: "user-applicant",
      metadata: {},
      members: [],
      invitations: [],
      teams: [],
    });
    proposals.set(
      "accra",
      savedProposal("prop-accra", "accra", { orgId: "legacy-accra", applyStatus: "applying" }),
    );
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    await admin.applyCommunityProposal({
      proposalId: "prop-accra",
      entityId: "accra",
      hostname: "accra.citynode.app",
    });
    proposals.set(
      "accra",
      savedProposal("prop-accra", "accra", { orgId: "legacy-accra", applyStatus: "failed" }),
    );
    deleteOrganization.mockClear();

    expect(
      await admin.releaseCommunityProposal({
        proposalId: "prop-accra",
        entityId: "accra",
        expectedUpdatedAt: savedAt,
      }),
    ).toEqual({
      community: { released: true, keptReason: null },
      organization: { released: false, keptReason: "existing" },
    });
    expect(deleteOrganization).not.toHaveBeenCalled();
  });
  it("makes the reviewer owner and invites the applicant when the application saved no applicant user", async () => {
    proposals.set(
      "brooklyn",
      savedProposal("prop-brooklyn", "brooklyn", { applicantUserId: null }),
    );
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-brooklyn",
      entityId: "brooklyn",
      hostname: "brooklyn.citynode.app",
    };
    inviteMember.mockClear();
    const first = await admin.applyCommunityProposal(input);
    expect(first.applicantInvited).toBe(true);
    const organization = organizations.get("org-brooklyn")!;
    expect(organization.metadata).toEqual({
      communityProposalId: "prop-brooklyn",
      communityApplicantAccountId: applicant,
      communityReviewerId: "platform-reviewer",
    });
    expect(
      Object.fromEntries(organization.members.map((member) => [member.userId, member.role])),
    ).toEqual({ "platform-reviewer": "owner" });
    expect(organization.invitations).toMatchObject([
      { nearAccountId: applicant, nearNetwork: "mainnet", role: "owner", status: "pending" },
    ]);
    expect(organization.teams).toHaveLength(3);
    const node = await admin.getNode({ nodeId: first.nodeId });
    const tenant = (await admin.listTenants()).find((item) => item.id === node?.tenantId);
    expect(tenant?.orgId).toBe("org-brooklyn");

    const resumed = await admin.applyCommunityProposal(input);
    expect(resumed).toEqual({ nodeId: first.nodeId, applicantInvited: true });
    expect(inviteMember).toHaveBeenCalledTimes(1);
    expect(organization.invitations).toHaveLength(1);

    organization.invitations[0]!.status = "accepted";
    await admin.applyCommunityProposal(input);
    expect(inviteMember).toHaveBeenCalledTimes(1);
  });

  it("invites the applicant again once the earlier invitation expired", async () => {
    proposals.set("queens", savedProposal("prop-queens", "queens", { applicantUserId: null }));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const input = {
      proposalId: "prop-queens",
      entityId: "queens",
      hostname: "queens.citynode.app",
    };
    await admin.applyCommunityProposal(input);
    const organization = organizations.get("org-queens")!;
    organization.invitations[0]!.expiresAt = new Date("2026-01-01T00:00:00.000Z");
    inviteMember.mockClear();
    await admin.applyCommunityProposal(input);
    expect(inviteMember).toHaveBeenCalledTimes(1);
    expect(inviteMember).toHaveBeenCalledWith(
      "platform-reviewer",
      expect.objectContaining({ nearAccountId: applicant, resend: true }),
    );
  });

  it("leaves an unverified legacy organization untouched when the application saved no applicant user", async () => {
    organizations.set("legacy-harlem", {
      id: "legacy-harlem",
      name: "Harlem Builders",
      slug: "harlem-builders",
      status: "active",
      requestedBy: "user-legacy-requester",
      metadata: {},
      members: [
        {
          id: "member-legacy-owner",
          userId: "user-legacy-requester",
          organizationId: "legacy-harlem",
          role: "owner",
        },
      ],
      invitations: [],
      teams: [],
    });
    proposals.set(
      "harlem",
      savedProposal("prop-harlem", "harlem", { orgId: "legacy-harlem", applicantUserId: null }),
    );
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    const applied = await admin.applyCommunityProposal({
      proposalId: "prop-harlem",
      entityId: "harlem",
      hostname: "harlem.citynode.app",
    });
    expect(applied.applicantInvited).toBe(true);
    const legacy = organizations.get("legacy-harlem")!;
    expect(legacy.metadata).toEqual({});
    expect(legacy.members.map((member) => [member.userId, member.role])).toEqual([
      ["user-legacy-requester", "owner"],
    ]);
    expect(legacy.invitations).toEqual([]);
    const created = organizations.get("org-harlem")!;
    expect(
      Object.fromEntries(created.members.map((member) => [member.userId, member.role])),
    ).toEqual({ "platform-reviewer": "owner" });
    expect(created.invitations).toMatchObject([{ nearAccountId: applicant, role: "owner" }]);
    const node = await admin.getNode({ nodeId: applied.nodeId });
    const tenant = (await admin.listTenants()).find((item) => item.id === node?.tenantId);
    expect(tenant?.orgId).toBe("org-harlem");

    const failed: Record<string, unknown> | undefined = proposals.get("harlem");
    if (failed) failed.applyStatus = "failed";
    deleteOrganization.mockClear();
    expect(
      await admin.releaseCommunityProposal({
        proposalId: "prop-harlem",
        entityId: "harlem",
        expectedUpdatedAt: savedAt,
      }),
    ).toMatchObject({ organization: { released: true, keptReason: null } });
    expect(deleteOrganization).toHaveBeenCalledWith({ organizationId: "org-harlem" });
    expect(organizations.has("legacy-harlem")).toBe(true);
  });

  it("removes a failed setup whose only invitation is the applicant's", async () => {
    proposals.set("bronx", savedProposal("prop-bronx", "bronx", { applicantUserId: null }));
    const admin = await getPluginClient(authedContext("platform-reviewer", "admin"));
    await admin.applyCommunityProposal({
      proposalId: "prop-bronx",
      entityId: "bronx",
      hostname: "bronx.citynode.app",
    });
    const failed: Record<string, unknown> | undefined = proposals.get("bronx");
    if (failed) failed.applyStatus = "failed";
    deleteOrganization.mockClear();
    expect(
      await admin.releaseCommunityProposal({
        proposalId: "prop-bronx",
        entityId: "bronx",
        expectedUpdatedAt: savedAt,
      }),
    ).toEqual({
      community: { released: true, keptReason: null },
      organization: { released: true, keptReason: null },
    });
    expect(deleteOrganization).toHaveBeenCalledWith({ organizationId: "org-bronx" });
  });
});
