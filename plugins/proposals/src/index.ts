import { MemoryPublisher } from "@orpc/publisher/memory";
import { ORPCError } from "@orpc/server";
import { Context, DateTime, Effect, Exit, Layer } from "effect";
import { createPlugin } from "every-plugin";
import { z } from "zod";
import { contract, NodeApplicationPayloadSchema, type ProposalEventSchema } from "./contract";
import { DatabaseLive } from "./db/layer";
import type { AuthPluginContext as AuthContext } from "./lib/auth-types.gen";
import { verifyNodeApplicant } from "./services/node-applicant";
import { ProposalService, ProposalServiceLive } from "./services/proposals";

type ProposalEvent = z.infer<typeof ProposalEventSchema>;

type ProposalEvents = {
  proposal: ProposalEvent;
};

type ProposalContext = AuthContext & {
  allowPrivateSubmission?: boolean;
  resubmissionPolicy?: "rejected-only" | "rejected-or-removed";
};

const ProposalContextSchema = z.custom<ProposalContext>();

class ProposalPublisher extends Context.Service<
  ProposalPublisher,
  MemoryPublisher<ProposalEvents>
>()("proposals/Publisher") {}

class ProposalPluginConfig extends Context.Service<
  ProposalPluginConfig,
  { privatePluginIds: Set<string> }
>()("proposals/PluginConfig") {}

export default createPlugin({
  variables: z.object({
    privatePluginIds: z.array(z.string().min(1).max(100)).default([]),
  }),

  secrets: z.object({
    PROPOSALS_DATABASE_URL: z.string().default("pglite:.bos/proposals/:memory:"),
  }),

  context: ProposalContextSchema,

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const Database = DatabaseLive(config.secrets.PROPOSALS_DATABASE_URL);
      const publisher = new MemoryPublisher<ProposalEvents>({
        resume: { enabled: true, seconds: 120 },
      });

      yield* Effect.log("[Proposals] Services Initialized");
      return Layer.mergeAll(
        ProposalServiceLive.pipe(Layer.provide(Database)),
        Layer.succeed(ProposalPublisher, publisher),
        Layer.succeed(ProposalPluginConfig, {
          privatePluginIds: new Set(config.variables.privatePluginIds),
        }),
      );
    }),

  createRouter: (builder) => {
    const requireAuth = builder.middleware(async ({ context, next }) => {
      if (!context.user || !context.userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
        });
      }
      return next({ context });
    });

    const requireAdmin = builder.middleware(async ({ context, next }) => {
      if (!context.user || !context.userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
        });
      }
      if (context.user.role !== "admin") {
        throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
      }
      return next({ context });
    });

    const requireAuthOrApiKey = builder.middleware(async ({ context, next }) => {
      if (!context.user && !context.userId && !context.apiKey) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: { hint: "Sign in or provide an API key" },
        });
      }
      return next({ context });
    });

    const viewerId = (context: ProposalContext) =>
      context.near?.primaryAccountId ?? context.userId ?? context.apiKey?.id;

    const proposalScope = (privatePluginIds: Set<string>, context: ProposalContext) => ({
      privatePluginIds: Array.from(privatePluginIds),
      viewerId: viewerId(context),
      isAdmin: context.user?.role === "admin",
    });

    const canReadProposal = (context: ProposalContext, pluginId: string, entityId: string) =>
      Effect.gen(function* () {
        const { privatePluginIds } = yield* ProposalPluginConfig;
        if (!privatePluginIds.has(pluginId) || context.user?.role === "admin") return true;
        const proposal = yield* ProposalService;
        const scoped = yield* proposal.getProposals({
          pluginId,
          entityId,
          limit: 1,
          ...proposalScope(privatePluginIds, context),
        });
        return scoped.data.length > 0;
      });

    const publishProposalEvent = (action: string, proposal: any) =>
      Effect.gen(function* () {
        const publisher = yield* ProposalPublisher;
        const timestamp = DateTime.formatIso(yield* DateTime.now);
        yield* Effect.promise(() =>
          publisher.publish("proposal", {
            action,
            pluginId: proposal.pluginId,
            entityId: proposal.entityId,
            reviewStatus: proposal.reviewStatus,
            applyStatus: proposal.applyStatus,
            removeStatus: proposal.removeStatus,
            submissionCount: proposal.submissionCount,
            timestamp,
          }),
        );
      });

    return {
      propose: builder.propose.use(requireAuthOrApiKey).effect(function* ({ input, context }) {
        const { privatePluginIds } = yield* ProposalPluginConfig;
        if (privatePluginIds.has(input.pluginId) && !context.allowPrivateSubmission) {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", {
              message: "Use the plugin's dedicated proposal endpoint",
            }),
          );
        }
        const actorId =
          context.near?.primaryAccountId ?? context.userId ?? context.apiKey?.id ?? "unknown";
        let submission = input;
        if (input.pluginId === "node") {
          const applicantAccountId = context.near?.primaryAccountId;
          if (!context.userId || !applicantAccountId) {
            return yield* Effect.fail(
              new ORPCError("UNAUTHORIZED", { message: "Sign in with a NEAR account to apply" }),
            );
          }
          const parsed = NodeApplicationPayloadSchema.safeParse(input.payload);
          if (!parsed.success || parsed.data.slug !== input.entityId) {
            return yield* Effect.fail(
              new ORPCError("BAD_REQUEST", { message: "Invalid community application payload" }),
            );
          }
          if (parsed.data.orgId !== context.organization?.activeOrganizationId) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", { message: "Select the applicant organization first" }),
            );
          }
          if (
            parsed.data.submitterAccountId &&
            parsed.data.submitterAccountId !== applicantAccountId
          ) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", {
                message: "Applicant identity does not match the session",
              }),
            );
          }
          const identity = context.near?.linkedAccounts.find(
            (account) => account.accountId === applicantAccountId && account.isPrimary,
          );
          const networkId = identity?.network === "testnet" ? "testnet" : "mainnet";
          const eligible = yield* verifyNodeApplicant(
            parsed.data.accountId,
            applicantAccountId,
            networkId,
          );
          if (!eligible) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", {
                message: "The applicant must be an explicit member of the proposed DAO",
              }),
            );
          }
          submission = {
            ...input,
            payload: { ...parsed.data, submitterAccountId: applicantAccountId },
          };
        }
        const proposal = yield* ProposalService;
        const result = yield* proposal.propose({
          ...submission,
          actorId,
          actor: context.user ?? undefined,
          resubmissionPolicy:
            input.pluginId === "node" ? "rejected-only" : context.resubmissionPolicy,
          requireSameActor: input.pluginId === "node",
        });
        yield* publishProposalEvent("proposed", result);
        return { data: result };
      }),

      getMyNodeApplications: builder.getMyNodeApplications.use(requireAuth).effect(function* ({
        context,
      }) {
        const applicantAccountId = context.near?.primaryAccountId;
        if (!applicantAccountId) {
          return yield* Effect.fail(
            new ORPCError("UNAUTHORIZED", { message: "Sign in with a NEAR account" }),
          );
        }
        const proposal = yield* ProposalService;
        return { data: yield* proposal.getMyNodeApplications(applicantAccountId) };
      }),

      approve: builder.approve.use(requireAdmin).effect(function* ({ input, context }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.approve({
          ...input,
          actorId: context.userId!,
          actor: context.user ?? undefined,
        });
        yield* publishProposalEvent("approved", result);
        return { data: result };
      }),

      reject: builder.reject.use(requireAdmin).effect(function* ({ input, context }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.reject({
          ...input,
          actorId: context.userId!,
          actor: context.user ?? undefined,
        });
        yield* publishProposalEvent("rejected", result);
        return { data: result };
      }),

      reopen: builder.reopen.use(requireAdmin).effect(function* ({ input, context }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.reopen({
          ...input,
          actorId: context.userId!,
          actor: context.user ?? undefined,
        });
        yield* publishProposalEvent("reopened", result);
        return { data: result };
      }),

      remove: builder.remove.use(requireAdmin).effect(function* ({ input, context }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.remove({
          ...input,
          actorId: context.userId!,
          actor: context.user ?? undefined,
        });
        yield* publishProposalEvent("removed", result);
        return { data: result };
      }),

      markApplied: builder.markApplied.use(requireAdmin).effect(function* ({ input }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.markApplied(input);
        yield* publishProposalEvent("applied", result);
        return { data: result };
      }),

      markApplyFailed: builder.markApplyFailed.use(requireAdmin).effect(function* ({ input }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.markApplyFailed(input);
        yield* publishProposalEvent("apply_failed", result);
        return { data: result };
      }),

      markRemoved: builder.markRemoved.use(requireAdmin).effect(function* ({ input }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.markRemoved(input);
        yield* publishProposalEvent("removed", result);
        return { data: result };
      }),

      markRemoveFailed: builder.markRemoveFailed.use(requireAdmin).effect(function* ({ input }) {
        const proposal = yield* ProposalService;
        const result = yield* proposal.markRemoveFailed(input);
        yield* publishProposalEvent("remove_failed", result);
        return { data: result };
      }),

      getProposals: builder.getProposals.effect(function* ({ input, context }) {
        const { privatePluginIds } = yield* ProposalPluginConfig;
        const proposal = yield* ProposalService;
        const isAdmin = context.user?.role === "admin";
        const result = yield* proposal.getProposals({
          ...input,
          ...proposalScope(privatePluginIds, context),
        });
        if (isAdmin) return result;
        return {
          data: result.data.map(
            (entry: { createdBy: string; payload: unknown; [key: string]: unknown }) => {
              const { createdBy: _createdBy, payload: _payload, ...proposal } = entry;
              return { ...proposal, payload: null, createdBy: "[hidden]" as const };
            },
          ),
          meta: result.meta,
        };
      }),

      getProposalCount: builder.getProposalCount.effect(function* ({ input, context }) {
        if (!(yield* canReadProposal(context, input.pluginId, input.entityId))) {
          return { ...input, totalCount: 0 };
        }
        const proposal = yield* ProposalService;
        return yield* proposal.getProposalCount(input);
      }),

      getAuditLog: builder.getAuditLog.use(requireAdmin).effect(function* ({ input, context }) {
        if (!(yield* canReadProposal(context, input.pluginId, input.entityId))) {
          return {
            data: [],
            meta: { total: 0, hasMore: false, nextCursor: null },
          };
        }
        const proposal = yield* ProposalService;
        return yield* proposal.getAuditLog(input);
      }),

      getSubmissions: builder.getSubmissions.use(requireAdmin).effect(function* ({ input }) {
        const proposal = yield* ProposalService;
        return yield* proposal.getSubmissions(input);
      }),

      getMySubmission: builder.getMySubmission.use(requireAuth).effect(function* ({
        input,
        context,
      }) {
        const nearAccounts = [
          context.near?.primaryAccountId,
          ...(context.near?.linkedAccounts ?? []).map(({ accountId }) => accountId),
        ];
        const submittedBy = Array.from(
          new Set(
            [
              context.userId,
              ...nearAccounts,
              ...nearAccounts.map((accountId) => accountId?.toLowerCase()),
            ].filter((value): value is string => Boolean(value)),
          ),
        );
        const proposal = yield* ProposalService;
        return yield* proposal.getMySubmission({
          ...input,
          submittedBy,
        });
      }),

      getReviewHistory: builder.getReviewHistory.use(requireAdmin).effect(function* ({ input }) {
        const proposal = yield* ProposalService;
        return yield* proposal.getReviewHistory(input);
      }),

      subscribe: builder.subscribe.handler(async function* ({
        input,
        context,
        signal,
        lastEventId,
      }) {
        const publisher = Context.get(context["effect/context"], ProposalPublisher);
        const iterator = publisher.subscribe("proposal", {
          signal,
          lastEventId,
        });
        for await (const event of iterator) {
          if (input.pluginId && event.pluginId !== input.pluginId) continue;
          if (input.entityId && event.entityId !== input.entityId) continue;
          const canRead = await Effect.runPromiseExit(
            canReadProposal(context, event.pluginId, event.entityId).pipe(
              Effect.provide(context["effect/context"]),
            ),
          );
          if (Exit.isFailure(canRead) || !canRead.value) continue;
          yield event;
        }
      }),
    };
  },
});
