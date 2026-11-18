import "@orpc/openapi/extensions/route";
import type { InferContractRouterInputs, InferContractRouterOutputs } from "@orpc/contract";
import { eventIterator, oc } from "@orpc/contract";
import { BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";
import { z } from "zod";

const ReviewStatus = z.enum(["pending", "approved", "rejected", "removed"]);
const ExpectedProposalVersion = z.object({
  pluginId: z.string(),
  entityId: z.string(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const ProposalSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  entityId: z.string(),
  operation: z.literal("create"),
  payload: z.unknown(),
  schemaVersion: z.string(),
  createdBy: z.string(),
  reviewStatus: ReviewStatus,
  rejectionReason: z.string().nullable(),
  submissionCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ProposalAuditEntrySchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  entityId: z.string(),
  action: z.string(),
  actor: z.string(),
  actorLabel: z.string().nullable(),
  details: z.unknown().nullable(),
  createdAt: z.iso.datetime(),
});

export const ProposalSubmissionSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  entityId: z.string(),
  submittedBy: z.string(),
  source: z.string().nullable(),
  payload: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.iso.datetime(),
});

export const ProposalReviewHistoryEntrySchema = ProposalAuditEntrySchema.extend({
  action: z.enum(["approved", "rejected"]),
  proposal: ProposalSchema,
});

export const ProposalEventSchema = z.object({
  action: z.string(),
  pluginId: z.string(),
  entityId: z.string(),
  reviewStatus: ReviewStatus,
  submissionCount: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
});

export const NodeApplicationPayloadSchema = z.object({
  placeId: z.uuid(),
  name: z.string().trim().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  motivation: z.string().trim().min(1),
  accountId: z
    .string()
    .regex(/^(?=.{2,64}$)[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)*$/),
  submitterAccountId: z.string().optional(),
  applicantUserId: z.string().optional(),
});

export const contract = oc.router({
  propose: oc
    .route({ method: "POST", path: "/v1/proposals" })
    .input(
      z.object({
        pluginId: z.string().min(1).max(100),
        entityId: z.string().min(1).max(255),
        payload: z.unknown(),
        source: z.string().max(100).optional(),
        metadata: z.unknown().optional(),
        idempotencyKey: z.string().max(255).optional(),
      }),
    )
    .output(z.object({ data: ProposalSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN, BAD_REQUEST }),

  getMyNodeApplications: oc
    .route({ method: "GET", path: "/v1/proposals/node/mine" })
    .output(z.object({ data: z.array(ProposalSchema) }))
    .errors({ UNAUTHORIZED }),

  approve: oc
    .route({ method: "POST", path: "/v1/proposals/{pluginId}/{entityId}/approve" })
    .input(ExpectedProposalVersion)
    .output(z.object({ data: ProposalSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),

  reject: oc
    .route({ method: "POST", path: "/v1/proposals/{pluginId}/{entityId}/reject" })
    .input(
      z.object({
        pluginId: z.string(),
        entityId: z.string(),
        expectedUpdatedAt: z.iso.datetime(),
        reason: z.string().max(1000).optional(),
      }),
    )
    .output(z.object({ data: ProposalSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),

  reopen: oc
    .route({ method: "POST", path: "/v1/proposals/{pluginId}/{entityId}/reopen" })
    .input(ExpectedProposalVersion)
    .output(z.object({ data: ProposalSchema }))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),

  getProposals: oc
    .route({ method: "GET", path: "/v1/proposals" })
    .input(
      z.object({
        pluginId: z.string().optional(),
        entityId: z.string().optional(),
        reviewStatus: ReviewStatus.optional(),
        query: z.string().trim().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(
      z.object({
        data: z.array(ProposalSchema),
        meta: z.object({
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        }),
      }),
    ),

  getProposalCount: oc
    .route({ method: "GET", path: "/v1/proposals/{pluginId}/{entityId}/count" })
    .input(z.object({ pluginId: z.string(), entityId: z.string() }))
    .output(
      z.object({
        pluginId: z.string(),
        entityId: z.string(),
        totalCount: z.number().int().nonnegative(),
      }),
    ),

  getAuditLog: oc
    .route({ method: "GET", path: "/v1/proposals/{pluginId}/{entityId}/audit" })
    .input(
      z.object({
        pluginId: z.string(),
        entityId: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(
      z.object({
        data: z.array(ProposalAuditEntrySchema),
        meta: z.object({
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        }),
      }),
    ),

  getSubmissions: oc
    .route({ method: "GET", path: "/v1/proposals/{pluginId}/{entityId}/submissions" })
    .input(
      z.object({
        pluginId: z.string(),
        entityId: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(
      z.object({
        data: z.array(ProposalSubmissionSchema),
        meta: z.object({
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        }),
      }),
    )
    .errors({ UNAUTHORIZED, FORBIDDEN }),

  getMySubmission: oc
    .route({ method: "GET", path: "/v1/proposals/{pluginId}/{entityId}/submissions/me" })
    .input(z.object({ pluginId: z.string(), entityId: z.string() }))
    .output(z.object({ hasSubmitted: z.boolean() }))
    .errors({ UNAUTHORIZED }),

  getReviewHistory: oc
    .route({ method: "GET", path: "/v1/proposals/review-history" })
    .input(
      z.object({
        pluginId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(
      z.object({
        data: z.array(ProposalReviewHistoryEntrySchema),
        meta: z.object({
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        }),
      }),
    )
    .errors({ UNAUTHORIZED, FORBIDDEN }),

  subscribe: oc
    .route({ method: "GET", path: "/v1/proposals/stream" })
    .input(
      z.object({
        pluginId: z.string().optional(),
        entityId: z.string().optional(),
      }),
    )
    .output(eventIterator(ProposalEventSchema)),
});

export type ContractType = typeof contract;

export type InferOutput<K extends keyof InferContractRouterOutputs<ContractType>> =
  InferContractRouterOutputs<ContractType>[K];
export type InferInput<K extends keyof InferContractRouterInputs<ContractType>> =
  InferContractRouterInputs<ContractType>[K];
