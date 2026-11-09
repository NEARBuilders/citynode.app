import type { ContractRouterClient } from "@orpc/contract";
import { ORPCError } from "@orpc/server";
import type { ContractType as authContract } from "../../../.bos/generated/auth/contract.d.ts";
import { resolveNetwork } from "../services/near-rpc";

type AuthClient = ContractRouterClient<authContract>;

const conflict = (message: string) => new ORPCError("CONFLICT", { message });

export const DEFAULT_TEAMS = [
  { name: "Operations", areas: ["node-operations"] },
  { name: "Treasury", areas: ["finance", "stake"] },
  { name: "Community", areas: ["events"] },
] as const;

const isNotFound = (error: unknown): boolean =>
  error instanceof ORPCError && error.code === "NOT_FOUND";

const isConflict = (error: unknown): boolean =>
  error instanceof ORPCError && error.code === "CONFLICT";

const isForbidden = (error: unknown): boolean =>
  error instanceof ORPCError && error.code === "FORBIDDEN";

const isSlugTaken = (error: unknown): boolean =>
  isConflict(error) || (error instanceof Error && /already (exists|taken)/i.test(error.message));

async function fetchOrganization(
  auth: AuthClient,
  organizationId?: string,
  organizationSlug?: string,
) {
  try {
    return await auth.getFullOrganization(
      organizationId ? { organizationId } : { organizationSlug },
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function readOrganization(
  auth: AuthClient,
  organizationId?: string,
  organizationSlug?: string,
) {
  try {
    return await fetchOrganization(auth, organizationId, organizationSlug);
  } catch (error) {
    if (isForbidden(error)) return null;
    throw error;
  }
}

const SLUG_CONFLICT = "The community slug is already used by another organization";
const SLUG_UNREACHABLE =
  "The community slug is used by an organization you are not a member of. Ask its owner to add you as an admin, or resume as an admin who belongs to it.";

type CommunityOrganization = NonNullable<Awaited<ReturnType<typeof fetchOrganization>>>;
type OrganizationSummary = Pick<
  CommunityOrganization,
  "id" | "name" | "slug" | "status" | "requestedBy" | "metadata"
>;
type ReviewerRole = "owner" | "admin";

function joinedReviewerIds(metadata: Record<string, unknown>) {
  const stored = metadata.communityReviewerIds;
  return typeof stored === "string" ? stored.split(",").filter(Boolean) : [];
}

async function openOrganization(
  auth: AuthClient,
  summary: OrganizationSummary,
  reviewerUserId: string,
  role: ReviewerRole,
): Promise<{ organization: CommunityOrganization; joined: boolean }> {
  const visible = await readOrganization(auth, summary.id);
  if (visible) return { organization: visible, joined: false };
  if (summary.status === "pending") {
    await auth.reviewOrganization({ organizationId: summary.id, decision: "approve" });
  }
  await auth.addMember({ userId: reviewerUserId, role, organizationId: summary.id });
  const joined = await readOrganization(auth, summary.id);
  if (!joined) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not open the community organization",
    });
  }
  return { organization: joined, joined: true };
}

async function locateSlugOrganization(
  auth: AuthClient,
  input: { slug: string; recordedOrganizationId?: string },
): Promise<OrganizationSummary | null> {
  if (input.recordedOrganizationId) {
    const recorded = await auth.getOrganizationForAdmin({
      organizationId: input.recordedOrganizationId,
    });
    if (recorded?.slug === input.slug) return recorded;
  }
  const visible = await readOrganization(auth, undefined, input.slug);
  if (visible) return visible;
  const requests = await auth.listOrganizationRequests();
  return requests.find((request) => request.slug === input.slug) ?? null;
}

async function createCommunityOrganization(
  auth: AuthClient,
  input: {
    proposalId: string;
    name: string;
    slug: string;
    metadata: Record<string, string>;
  },
) {
  try {
    return await auth.createOrganization({
      name: input.name,
      slug: input.slug,
      metadata: input.metadata,
    });
  } catch (error) {
    // Another admin applying the same proposal concurrently won the unique-slug insert.
    if (!isConflict(error)) throw error;
    const raced = await readOrganization(auth, undefined, input.slug);
    if (!raced || raced.metadata?.communityProposalId !== input.proposalId) throw error;
    return raced;
  }
}

function applicantMetadata(input: {
  proposalId: string;
  proposerUserId: string | null;
  applicantAccountId: string;
  reviewerUserId: string;
}) {
  return {
    communityProposalId: input.proposalId,
    ...(input.proposerUserId
      ? { communityApplicantId: input.proposerUserId }
      : { communityApplicantAccountId: input.applicantAccountId }),
    communityReviewerId: input.reviewerUserId,
  };
}

async function inviteApplicant(auth: AuthClient, organizationId: string, accountId: string) {
  const invitations = await auth.listInvitations({ organizationId });
  const now = Date.now();
  const existing = invitations.find(
    (invitation) =>
      invitation.nearAccountId === accountId &&
      (invitation.status === "accepted" ||
        (invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > now)),
  );
  if (existing) return;
  await auth.inviteMember({
    nearAccountId: accountId,
    nearNetwork: resolveNetwork(accountId),
    role: "owner",
    organizationId,
    resend: true,
  });
}

async function provisionDefaultTeams(auth: AuthClient, organizationId: string) {
  const teams = await auth.listTeams({ organizationId });
  for (const team of DEFAULT_TEAMS) {
    if (teams.some((stored) => stored.name === team.name)) continue;
    await auth.createTeam({ name: team.name, areas: [...team.areas], organizationId });
  }
}

async function grantProposerOwnership(
  auth: AuthClient,
  organizationId: string,
  proposerUserId: string,
) {
  const { members } = await auth.listMembers({ organizationId });
  const proposerMember = members.find((member) => member.userId === proposerUserId);
  if (!proposerMember) {
    await auth.addMember({ userId: proposerUserId, role: "owner", organizationId });
    return;
  }
  if (proposerMember.role !== "owner") {
    await auth.updateMemberRole({
      memberId: proposerMember.id,
      role: "owner",
      organizationId,
    });
  }
}

type ProvisionInput = {
  proposalId: string;
  name: string;
  slug: string;
  proposerUserId?: string;
  applicantAccountId: string;
  reviewerUserId: string;
  legacyOrgId?: string;
  recordedOrganizationId?: string;
  onOrganization?: (organizationId: string) => Promise<unknown>;
};

async function bindCommunityOrganization(
  auth: AuthClient,
  summary: OrganizationSummary,
  input: ProvisionInput,
  adopted = false,
) {
  const proposerUserId = input.proposerUserId ?? null;
  const notOwned = () => conflict("The applicant does not own the existing organization");
  const summaryMetadata = summary.metadata ?? {};
  if (
    summaryMetadata.communityProposalId &&
    summaryMetadata.communityProposalId !== input.proposalId
  ) {
    throw conflict(
      adopted ? SLUG_CONFLICT : "This organization belongs to another community application",
    );
  }
  if (summary.status === "rejected") {
    throw conflict(adopted ? SLUG_CONFLICT : "The existing organization request was rejected");
  }
  if (
    summary.status === "pending" &&
    summary.requestedBy &&
    proposerUserId &&
    summary.requestedBy !== proposerUserId
  ) {
    throw notOwned();
  }
  const { organization, joined } = await openOrganization(
    auth,
    summary,
    input.reviewerUserId,
    "admin",
  );
  if (organization.requestedBy && proposerUserId && organization.requestedBy !== proposerUserId) {
    const proposerMember = organization.members.find((member) => member.userId === proposerUserId);
    if (proposerMember?.role !== "owner") {
      if (joined) {
        await auth.leaveOrganization({ organizationId: organization.id }).catch(() => undefined);
      }
      throw notOwned();
    }
  }
  if (organization.status === "pending") {
    await auth.reviewOrganization({ organizationId: organization.id, decision: "approve" });
  }
  await input.onOrganization?.(organization.id);
  const metadata = organization.metadata ?? {};
  const stamp = {
    ...applicantMetadata({ ...input, proposerUserId }),
    ...(adopted ? { communityLinkedOrg: "true" } : {}),
  };
  if (Object.entries(stamp).some(([key, value]) => metadata[key] !== value)) {
    await auth.updateOrganization({
      data: { metadata: { ...metadata, ...stamp } },
      organizationId: organization.id,
    });
  }
  if (proposerUserId) {
    await grantProposerOwnership(auth, organization.id, proposerUserId);
  }
  if (input.reviewerUserId !== proposerUserId) {
    const { members } = await auth.listMembers({ organizationId: organization.id });
    const reviewerMember = members.find((member) => member.userId === input.reviewerUserId);
    if (!reviewerMember) {
      await auth.addMember({
        userId: input.reviewerUserId,
        role: "admin",
        organizationId: organization.id,
      });
    } else if (adopted && reviewerMember.role === "owner") {
      await auth.updateMemberRole({
        memberId: reviewerMember.id,
        role: "admin",
        organizationId: organization.id,
      });
    }
  }
  await provisionDefaultTeams(auth, organization.id);
  return organization;
}

export async function provisionCommunityOrganization(
  auth: AuthClient,
  input: ProvisionInput,
): Promise<{ id: string; name: string; slug: string; applicantInvited: boolean }> {
  const proposerUserId = input.proposerUserId ?? null;
  if (input.legacyOrgId && proposerUserId) {
    const legacy = await auth.getOrganizationForAdmin({ organizationId: input.legacyOrgId });
    if (!legacy) {
      throw conflict("The application's existing organization was removed");
    }
    const organization = await bindCommunityOrganization(auth, legacy, input);
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      applicantInvited: false,
    };
  }

  const slugStatus = await auth.checkSlug({ slug: input.slug });
  const existing = slugStatus.status ? null : await locateSlugOrganization(auth, input);
  if (existing && existing.metadata?.communityProposalId !== input.proposalId) {
    const organization = await bindCommunityOrganization(auth, existing, input, true);
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      applicantInvited: false,
    };
  }
  const summary =
    existing ??
    (await createCommunityOrganization(auth, {
      ...input,
      metadata: applicantMetadata({ ...input, proposerUserId }),
    }).catch((error: unknown) => {
      if (!slugStatus.status && isSlugTaken(error)) throw conflict(SLUG_UNREACHABLE);
      throw error;
    }));
  if (summary.status === "rejected") {
    throw conflict("The community organization request was rejected");
  }
  await input.onOrganization?.(summary.id);
  const linked = summary.metadata?.communityLinkedOrg === "true";
  const { organization, joined } = await openOrganization(
    auth,
    summary,
    input.reviewerUserId,
    proposerUserId || linked ? "admin" : "owner",
  );
  if (organization.status === "pending") {
    await auth.reviewOrganization({ organizationId: organization.id, decision: "approve" });
  }
  if (joined) {
    const metadata = organization.metadata ?? {};
    await auth.updateOrganization({
      data: {
        metadata: {
          ...metadata,
          communityReviewerIds: [
            ...new Set([...joinedReviewerIds(metadata), input.reviewerUserId]),
          ].join(","),
        },
      },
      organizationId: organization.id,
    });
  }
  if (!proposerUserId && linked) {
    const { members } = await auth.listMembers({ organizationId: organization.id });
    if (!members.some((member) => member.userId === input.reviewerUserId)) {
      await auth.addMember({
        userId: input.reviewerUserId,
        role: "admin",
        organizationId: organization.id,
      });
    }
    await provisionDefaultTeams(auth, organization.id);
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      applicantInvited: false,
    };
  }
  const ownerUserId = proposerUserId ?? input.reviewerUserId;
  await grantProposerOwnership(auth, organization.id, ownerUserId);
  if (input.reviewerUserId !== ownerUserId) {
    const { members } = await auth.listMembers({ organizationId: organization.id });
    const reviewerMember = members.find((member) => member.userId === input.reviewerUserId);
    if (!reviewerMember) {
      await auth.addMember({
        userId: input.reviewerUserId,
        role: "admin",
        organizationId: organization.id,
      });
    } else if (reviewerMember.role === "owner") {
      await auth.updateMemberRole({
        memberId: reviewerMember.id,
        role: "admin",
        organizationId: organization.id,
      });
    }
  }
  if (!proposerUserId) {
    await inviteApplicant(auth, organization.id, input.applicantAccountId);
  }
  await provisionDefaultTeams(auth, organization.id);
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    applicantInvited: !proposerUserId,
  };
}

export async function releaseCommunityOrganization(
  auth: AuthClient,
  input: { organizationId: string; proposalId: string },
): Promise<{ released: boolean; keptReason: "not_found" | "in_use" | "existing" | null }> {
  const organization = await fetchOrganization(auth, input.organizationId);
  if (!organization || organization.metadata?.communityProposalId !== input.proposalId) {
    return { released: false, keptReason: "not_found" };
  }
  if (organization.metadata?.communityLinkedOrg === "true") {
    return { released: false, keptReason: "existing" };
  }
  const provisioned = new Set(
    [
      organization.requestedBy,
      organization.metadata?.communityApplicantId,
      organization.metadata?.communityReviewerId,
      ...joinedReviewerIds(organization.metadata ?? {}),
    ].filter((id): id is string => typeof id === "string"),
  );
  if (organization.members.some((member) => !provisioned.has(member.userId))) {
    return { released: false, keptReason: "in_use" };
  }
  const applicantAccountId = organization.metadata?.communityApplicantAccountId;
  const otherInvitations = (organization.invitations ?? []).filter(
    (invitation) => !applicantAccountId || invitation.nearAccountId !== applicantAccountId,
  );
  if (otherInvitations.length > 0) {
    return { released: false, keptReason: "in_use" };
  }
  const codes = await auth.listOnboardingCodes({ organizationId: organization.id });
  if (codes.length > 0) {
    return { released: false, keptReason: "in_use" };
  }
  await auth.deleteOrganization({ organizationId: organization.id });
  return { released: true, keptReason: null };
}
