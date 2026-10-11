import type { WithEffectContext } from "@orpc/experimental-effect";
import { type Implementer, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { type AuthContextShape, createAuthMiddleware } from "everything-dev/api";
import type { ContractType } from "../contract";
import * as schema from "../db/schema";
import { provisionDefaultTeams } from "../default-teams";
import { AuthServicesTag } from "../service-types";
import { tryJsonParse } from "../utils";

type CommunityContext = AuthContextShape & WithEffectContext<AuthServicesTag>;

function conflict(message: string) {
  return new ORPCError("CONFLICT", { message });
}

export function createCommunityOrganizationHandlers(
  builder: Implementer<ContractType, CommunityContext>,
  requireAuth: ReturnType<typeof import("../middleware").createRequireAuth>,
) {
  const { requireAdmin } = createAuthMiddleware<CommunityContext>(builder);
  return {
    provisionCommunityOrganization: builder.provisionCommunityOrganization
      .use(requireAuth)
      .use(requireAdmin)
      .effect(function* ({ input, context }) {
        const services = yield* AuthServicesTag;
        const reviewerId = context.userId;
        if (!reviewerId) {
          return yield* Effect.fail(new ORPCError("UNAUTHORIZED", { message: "Sign in first" }));
        }
        return yield* Effect.tryPromise({
          try: () =>
            services.db.transaction(async (tx) => {
              const accounts = await tx
                .select({ userId: schema.nearAccount.userId })
                .from(schema.nearAccount)
                .where(eq(schema.nearAccount.accountId, input.proposerAccountId));
              const matchedUsers = [...new Set(accounts.map((account) => account.userId))];
              if (
                matchedUsers.length !== 1 ||
                (input.proposerUserId && matchedUsers[0] !== input.proposerUserId)
              ) {
                throw conflict(
                  "The application proposer no longer has a unique linked NEAR identity",
                );
              }
              const proposerId = matchedUsers[0]!;
              const organizationId = input.legacyOrgId ?? `community-${input.proposalId}`;
              let created = false;
              if (!input.legacyOrgId) {
                const inserted = await tx
                  .insert(schema.organization)
                  .values({
                    id: organizationId,
                    name: input.name,
                    slug: input.slug,
                    status: "active",
                    requestedBy: proposerId,
                    metadata: JSON.stringify({
                      communityProposalId: input.proposalId,
                      communityReviewerId: reviewerId,
                    }),
                    createdAt: new Date(),
                  })
                  .onConflictDoNothing()
                  .returning({ id: schema.organization.id });
                created = inserted.length > 0;
              }
              const [organization] = await tx
                .select()
                .from(schema.organization)
                .where(eq(schema.organization.id, organizationId))
                .for("update");
              if (!organization) {
                throw conflict(
                  input.legacyOrgId
                    ? "The application's existing organization was removed"
                    : "The community slug is already used by another organization",
                );
              }
              const metadata = tryJsonParse<Record<string, unknown>>(organization.metadata) ?? {};
              if (
                metadata.communityProposalId &&
                metadata.communityProposalId !== input.proposalId
              ) {
                throw conflict("This organization belongs to another community application");
              }
              if (
                !input.legacyOrgId &&
                (organization.requestedBy !== proposerId ||
                  (!created && metadata.communityProposalId !== input.proposalId))
              ) {
                throw conflict("The saved community organization belongs to another applicant");
              }
              if (
                !input.legacyOrgId &&
                (organization.slug !== input.slug || organization.name !== input.name)
              ) {
                throw conflict("The saved community organization does not match this application");
              }
              const [proposerMember] = await tx
                .select()
                .from(schema.member)
                .where(
                  and(
                    eq(schema.member.organizationId, organization.id),
                    eq(schema.member.userId, proposerId),
                  ),
                )
                .limit(1);
              if (
                input.legacyOrgId &&
                organization.requestedBy !== proposerId &&
                proposerMember?.role !== "owner"
              ) {
                throw conflict("The applicant does not own the existing organization");
              }
              if (organization.status === "rejected") {
                throw conflict("The existing organization request was rejected");
              }
              const activated = organization.status === "pending";
              const firstProvision =
                created || activated || (input.legacyOrgId && !metadata.communityProposalId);
              if (activated || (input.legacyOrgId && !metadata.communityProposalId)) {
                await tx
                  .update(schema.organization)
                  .set({
                    status: "active",
                    metadata: JSON.stringify({
                      ...metadata,
                      communityProposalId: input.proposalId,
                      communityReviewerId: reviewerId,
                    }),
                    rejectionReason: null,
                  })
                  .where(eq(schema.organization.id, organization.id));
              }
              if (firstProvision && !proposerMember) {
                await tx.insert(schema.member).values({
                  id: crypto.randomUUID(),
                  organizationId: organization.id,
                  userId: proposerId,
                  role: "owner",
                  createdAt: new Date(),
                });
              } else if (firstProvision && proposerMember && proposerMember.role !== "owner") {
                await tx
                  .update(schema.member)
                  .set({ role: "owner" })
                  .where(eq(schema.member.id, proposerMember.id));
              }
              if (firstProvision && reviewerId !== proposerId) {
                const [reviewerMember] = await tx
                  .select()
                  .from(schema.member)
                  .where(
                    and(
                      eq(schema.member.organizationId, organization.id),
                      eq(schema.member.userId, reviewerId),
                    ),
                  )
                  .limit(1);
                if (!reviewerMember) {
                  await tx.insert(schema.member).values({
                    id: crypto.randomUUID(),
                    organizationId: organization.id,
                    userId: reviewerId,
                    role: "admin",
                    createdAt: new Date(),
                  });
                }
              }
              if (created || activated) {
                await provisionDefaultTeams(tx, organization.id);
              }
              return {
                ...organization,
                status: "active" as const,
                metadata: input.legacyOrgId
                  ? {
                      ...metadata,
                      communityProposalId: input.proposalId,
                      communityReviewerId: metadata.communityReviewerId ?? reviewerId,
                    }
                  : metadata,
              };
            }),
          catch: (error) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: "Could not provision the community organization",
                  cause: error,
                }),
        });
      }),
  };
}
