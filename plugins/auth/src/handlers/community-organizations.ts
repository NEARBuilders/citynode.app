import { type Implementer, ORPCError } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import { Effect } from "effect";
import type { AuthErrors, ContractType } from "../contract";
import { DatabaseTag } from "../db/layer";
import * as schema from "../db/schema";
import { provisionDefaultTeams } from "../default-teams";
import type { AuthHandlerContext } from "../middleware";
import { AuthApiTag, type PluginServices } from "../service-types";
import { createHeaders, tryJsonParse } from "../utils";

type ScopedServices = Pick<PluginServices, "auth" | "db">;

function conflict(message: string) {
  return new ORPCError("CONFLICT", { message });
}

function reviewingAdmin(services: ScopedServices, context: AuthHandlerContext, errors: AuthErrors) {
  return Effect.gen(function* () {
    const sessionUser =
      context.userId && context.user
        ? { id: context.userId, role: context.user.role }
        : (yield* Effect.tryPromise({
            try: () => services.auth.api.getSession({ headers: createHeaders(context.reqHeaders) }),
            catch: (cause) =>
              new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Could not read the reviewing session",
                cause,
              }),
          }))?.user;
    if (!sessionUser?.id) {
      return yield* Effect.fail(
        errors.UNAUTHORIZED({ message: "Sign in first", data: { apiKeyProvided: false } }),
      );
    }
    if (sessionUser.role !== "admin") {
      return yield* Effect.fail(errors.FORBIDDEN({ message: "Platform admin required", data: {} }));
    }
    return sessionUser.id;
  });
}

export function createCommunityOrganizationHandlers(
  builder: Implementer<ContractType, AuthHandlerContext>,
) {
  return {
    provisionCommunityOrganization: builder.provisionCommunityOrganization.effect(function* ({
      input,
      context,
      errors,
    }) {
      const services: ScopedServices = { auth: (yield* AuthApiTag).auth, db: yield* DatabaseTag };
      const reviewerId = yield* reviewingAdmin(services, context, errors);
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
            if (metadata.communityProposalId && metadata.communityProposalId !== input.proposalId) {
              throw conflict("This organization belongs to another community application");
            }
            if (
              !input.legacyOrgId &&
              (organization.requestedBy !== proposerId ||
                (!created && metadata.communityProposalId !== input.proposalId))
            ) {
              throw conflict("The saved community organization belongs to another applicant");
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
    releaseCommunityOrganization: builder.releaseCommunityOrganization.effect(function* ({
      input,
      context,
      errors,
    }) {
      const services: ScopedServices = { auth: (yield* AuthApiTag).auth, db: yield* DatabaseTag };
      yield* reviewingAdmin(services, context, errors);
      return yield* Effect.tryPromise({
        try: () =>
          services.db.transaction(async (tx) => {
            const organizationId = `community-${input.proposalId}`;
            const [organization] = await tx
              .select()
              .from(schema.organization)
              .where(eq(schema.organization.id, organizationId))
              .for("update");
            const metadata = tryJsonParse<Record<string, unknown>>(organization?.metadata) ?? {};
            if (!organization || metadata.communityProposalId !== input.proposalId) {
              return { released: false, keptReason: "not_found" as const };
            }
            const provisioned = new Set(
              [organization.requestedBy, metadata.communityReviewerId].filter(
                (id): id is string => typeof id === "string",
              ),
            );
            const members = await tx
              .select({ userId: schema.member.userId })
              .from(schema.member)
              .where(eq(schema.member.organizationId, organizationId));
            const [invitations] = await tx
              .select({ count: count() })
              .from(schema.invitation)
              .where(eq(schema.invitation.organizationId, organizationId));
            const [codes] = await tx
              .select({ count: count() })
              .from(schema.onboardingCode)
              .where(eq(schema.onboardingCode.organizationId, organizationId));
            if (
              members.some((member) => !provisioned.has(member.userId)) ||
              (invitations?.count ?? 0) > 0 ||
              (codes?.count ?? 0) > 0
            ) {
              return { released: false, keptReason: "in_use" as const };
            }
            await tx.delete(schema.organization).where(eq(schema.organization.id, organizationId));
            return { released: true, keptReason: null };
          }),
        catch: (error) =>
          error instanceof ORPCError
            ? error
            : new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Could not release the community organization",
                cause: error,
              }),
      });
    }),
  };
}
