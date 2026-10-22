import type { ContractRouterClient } from "@orpc/contract";
import { ORPCError } from "@orpc/server";
import type { ContractType as authContract } from "../../../.bos/generated/auth/contract.d.ts";

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

async function createCommunityOrganization(
  auth: AuthClient,
  input: {
    proposalId: string;
    name: string;
    slug: string;
    proposerUserId: string;
    reviewerUserId: string;
  },
) {
  try {
    return await auth.createOrganization({
      name: input.name,
      slug: input.slug,
      metadata: {
        communityProposalId: input.proposalId,
        communityApplicantId: input.proposerUserId,
        communityReviewerId: input.reviewerUserId,
      },
    });
  } catch (error) {
    // Another admin applying the same proposal concurrently won the unique-slug insert.
    if (!isConflict(error)) throw error;
    const raced = await fetchOrganization(auth, undefined, input.slug);
    if (!raced || raced.metadata?.communityProposalId !== input.proposalId) throw error;
    return raced;
  }
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

export async function provisionCommunityOrganization(
  auth: AuthClient,
  input: {
    proposalId: string;
    name: string;
    slug: string;
    proposerUserId: string;
    reviewerUserId: string;
    legacyOrgId?: string;
  },
): Promise<{ id: string; name: string; slug: string }> {
  if (input.legacyOrgId) {
    const organization = await fetchOrganization(auth, input.legacyOrgId);
    if (!organization) {
      throw conflict("The application's existing organization was removed");
    }
    const metadata = organization.metadata ?? {};
    if (metadata.communityProposalId && metadata.communityProposalId !== input.proposalId) {
      throw conflict("This organization belongs to another community application");
    }
    if (organization.requestedBy && organization.requestedBy !== input.proposerUserId) {
      const proposerMember = organization.members.find(
        (member) => member.userId === input.proposerUserId,
      );
      if (proposerMember?.role !== "owner") {
        throw conflict("The applicant does not own the existing organization");
      }
    }
    if (organization.status === "rejected") {
      throw conflict("The existing organization request was rejected");
    }
    if (organization.status === "pending") {
      await auth.reviewOrganization({
        organizationId: organization.id,
        decision: "approve",
      });
    }
    if (
      metadata.communityProposalId !== input.proposalId ||
      metadata.communityApplicantId !== input.proposerUserId ||
      metadata.communityReviewerId !== input.reviewerUserId
    ) {
      await auth.updateOrganization({
        data: {
          metadata: {
            ...metadata,
            communityProposalId: input.proposalId,
            communityApplicantId: input.proposerUserId,
            communityReviewerId: input.reviewerUserId,
          },
        },
        organizationId: organization.id,
      });
    }
    await grantProposerOwnership(auth, organization.id, input.proposerUserId);
    if (input.reviewerUserId !== input.proposerUserId) {
      const reviewerMember = organization.members.find(
        (member) => member.userId === input.reviewerUserId,
      );
      if (!reviewerMember) {
        await auth.addMember({
          userId: input.reviewerUserId,
          role: "admin",
          organizationId: organization.id,
        });
      }
    }
    await provisionDefaultTeams(auth, organization.id);
    return { id: organization.id, name: organization.name, slug: organization.slug };
  }

  const slugStatus = await auth.checkSlug({ slug: input.slug });
  const existing = slugStatus.status ? null : await fetchOrganization(auth, undefined, input.slug);
  if (existing && existing.metadata?.communityProposalId !== input.proposalId) {
    throw conflict("The community slug is already used by another organization");
  }
  const organization =
    existing ?? (await createCommunityOrganization(auth, input));
  await grantProposerOwnership(auth, organization.id, input.proposerUserId);
  if (input.reviewerUserId !== input.proposerUserId) {
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
  await provisionDefaultTeams(auth, organization.id);
  return { id: organization.id, name: organization.name, slug: organization.slug };
}

export async function releaseCommunityOrganization(
  auth: AuthClient,
  input: { organizationId: string; proposalId: string },
): Promise<{ released: boolean; keptReason: "not_found" | "in_use" | null }> {
  const organization = await fetchOrganization(auth, input.organizationId);
  if (!organization || organization.metadata?.communityProposalId !== input.proposalId) {
    return { released: false, keptReason: "not_found" };
  }
  const provisioned = new Set(
    [
      organization.requestedBy,
      organization.metadata?.communityApplicantId,
      organization.metadata?.communityReviewerId,
    ].filter((id): id is string => typeof id === "string"),
  );
  if (organization.members.some((member) => !provisioned.has(member.userId))) {
    return { released: false, keptReason: "in_use" };
  }
  if ((organization.invitations?.length ?? 0) > 0) {
    return { released: false, keptReason: "in_use" };
  }
  const codes = await auth.listOnboardingCodes({ organizationId: organization.id });
  if (codes.length > 0) {
    return { released: false, keptReason: "in_use" };
  }
  await auth.deleteOrganization({ organizationId: organization.id });
  return { released: true, keptReason: null };
}
