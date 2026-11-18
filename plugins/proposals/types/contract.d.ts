import "@orpc/openapi/extensions/route";
import type { InferContractRouterInputs, InferContractRouterOutputs } from "@orpc/contract";
import { z } from "zod";
export declare const ProposalSchema: z.ZodObject<{
    id: z.ZodString;
    pluginId: z.ZodString;
    entityId: z.ZodString;
    operation: z.ZodLiteral<"create">;
    payload: z.ZodUnknown;
    schemaVersion: z.ZodString;
    createdBy: z.ZodString;
    reviewStatus: z.ZodEnum<{
        approved: "approved";
        pending: "pending";
        rejected: "rejected";
        removed: "removed";
    }>;
    rejectionReason: z.ZodNullable<z.ZodString>;
    submissionCount: z.ZodNumber;
    createdAt: z.ZodISODateTime;
    updatedAt: z.ZodISODateTime;
}, z.core.$strip>;
export declare const ProposalAuditEntrySchema: z.ZodObject<{
    id: z.ZodString;
    pluginId: z.ZodString;
    entityId: z.ZodString;
    action: z.ZodString;
    actor: z.ZodString;
    actorLabel: z.ZodNullable<z.ZodString>;
    details: z.ZodNullable<z.ZodUnknown>;
    createdAt: z.ZodISODateTime;
}, z.core.$strip>;
export declare const ProposalSubmissionSchema: z.ZodObject<{
    id: z.ZodString;
    pluginId: z.ZodString;
    entityId: z.ZodString;
    submittedBy: z.ZodString;
    source: z.ZodNullable<z.ZodString>;
    payload: z.ZodNullable<z.ZodUnknown>;
    metadata: z.ZodNullable<z.ZodUnknown>;
    createdAt: z.ZodISODateTime;
}, z.core.$strip>;
export declare const ProposalReviewHistoryEntrySchema: z.ZodObject<{
    id: z.ZodString;
    pluginId: z.ZodString;
    entityId: z.ZodString;
    actor: z.ZodString;
    actorLabel: z.ZodNullable<z.ZodString>;
    details: z.ZodNullable<z.ZodUnknown>;
    createdAt: z.ZodISODateTime;
    action: z.ZodEnum<{
        approved: "approved";
        rejected: "rejected";
    }>;
    proposal: z.ZodObject<{
        id: z.ZodString;
        pluginId: z.ZodString;
        entityId: z.ZodString;
        operation: z.ZodLiteral<"create">;
        payload: z.ZodUnknown;
        schemaVersion: z.ZodString;
        createdBy: z.ZodString;
        reviewStatus: z.ZodEnum<{
            approved: "approved";
            pending: "pending";
            rejected: "rejected";
            removed: "removed";
        }>;
        rejectionReason: z.ZodNullable<z.ZodString>;
        submissionCount: z.ZodNumber;
        createdAt: z.ZodISODateTime;
        updatedAt: z.ZodISODateTime;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ProposalEventSchema: z.ZodObject<{
    action: z.ZodString;
    pluginId: z.ZodString;
    entityId: z.ZodString;
    reviewStatus: z.ZodEnum<{
        approved: "approved";
        pending: "pending";
        rejected: "rejected";
        removed: "removed";
    }>;
    submissionCount: z.ZodNumber;
    timestamp: z.ZodISODateTime;
}, z.core.$strip>;
export declare const NodeApplicationPayloadSchema: z.ZodObject<{
    placeId: z.ZodUUID;
    name: z.ZodString;
    slug: z.ZodString;
    motivation: z.ZodString;
    accountId: z.ZodString;
    submitterAccountId: z.ZodOptional<z.ZodString>;
    applicantUserId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const contract: {
    propose: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
        payload: z.ZodUnknown;
        source: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodUnknown>;
        idempotencyKey: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            operation: z.ZodLiteral<"create">;
            payload: z.ZodUnknown;
            schemaVersion: z.ZodString;
            createdBy: z.ZodString;
            reviewStatus: z.ZodEnum<{
                approved: "approved";
                pending: "pending";
                rejected: "rejected";
                removed: "removed";
            }>;
            rejectionReason: z.ZodNullable<z.ZodString>;
            submissionCount: z.ZodNumber;
            createdAt: z.ZodISODateTime;
            updatedAt: z.ZodISODateTime;
        }, z.core.$strip>;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
        FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>;
    getMyNodeApplications: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            operation: z.ZodLiteral<"create">;
            payload: z.ZodUnknown;
            schemaVersion: z.ZodString;
            createdBy: z.ZodString;
            reviewStatus: z.ZodEnum<{
                approved: "approved";
                pending: "pending";
                rejected: "rejected";
                removed: "removed";
            }>;
            rejectionReason: z.ZodNullable<z.ZodString>;
            submissionCount: z.ZodNumber;
            createdAt: z.ZodISODateTime;
            updatedAt: z.ZodISODateTime;
        }, z.core.$strip>>;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    approve: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
        expectedUpdatedAt: z.ZodISODateTime;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            operation: z.ZodLiteral<"create">;
            payload: z.ZodUnknown;
            schemaVersion: z.ZodString;
            createdBy: z.ZodString;
            reviewStatus: z.ZodEnum<{
                approved: "approved";
                pending: "pending";
                rejected: "rejected";
                removed: "removed";
            }>;
            rejectionReason: z.ZodNullable<z.ZodString>;
            submissionCount: z.ZodNumber;
            createdAt: z.ZodISODateTime;
            updatedAt: z.ZodISODateTime;
        }, z.core.$strip>;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
        FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        NOT_FOUND: {
            readonly status: 404;
            readonly data: z.ZodObject<{
                resource: z.ZodOptional<z.ZodString>;
                resourceId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>;
    reject: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
        expectedUpdatedAt: z.ZodISODateTime;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            operation: z.ZodLiteral<"create">;
            payload: z.ZodUnknown;
            schemaVersion: z.ZodString;
            createdBy: z.ZodString;
            reviewStatus: z.ZodEnum<{
                approved: "approved";
                pending: "pending";
                rejected: "rejected";
                removed: "removed";
            }>;
            rejectionReason: z.ZodNullable<z.ZodString>;
            submissionCount: z.ZodNumber;
            createdAt: z.ZodISODateTime;
            updatedAt: z.ZodISODateTime;
        }, z.core.$strip>;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
        FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        NOT_FOUND: {
            readonly status: 404;
            readonly data: z.ZodObject<{
                resource: z.ZodOptional<z.ZodString>;
                resourceId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>;
    reopen: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
        expectedUpdatedAt: z.ZodISODateTime;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            operation: z.ZodLiteral<"create">;
            payload: z.ZodUnknown;
            schemaVersion: z.ZodString;
            createdBy: z.ZodString;
            reviewStatus: z.ZodEnum<{
                approved: "approved";
                pending: "pending";
                rejected: "rejected";
                removed: "removed";
            }>;
            rejectionReason: z.ZodNullable<z.ZodString>;
            submissionCount: z.ZodNumber;
            createdAt: z.ZodISODateTime;
            updatedAt: z.ZodISODateTime;
        }, z.core.$strip>;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
        FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        NOT_FOUND: {
            readonly status: 404;
            readonly data: z.ZodObject<{
                resource: z.ZodOptional<z.ZodString>;
                resourceId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>;
    getProposals: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodOptional<z.ZodString>;
        entityId: z.ZodOptional<z.ZodString>;
        reviewStatus: z.ZodOptional<z.ZodEnum<{
            approved: "approved";
            pending: "pending";
            rejected: "rejected";
            removed: "removed";
        }>>;
        query: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        cursor: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            operation: z.ZodLiteral<"create">;
            payload: z.ZodUnknown;
            schemaVersion: z.ZodString;
            createdBy: z.ZodString;
            reviewStatus: z.ZodEnum<{
                approved: "approved";
                pending: "pending";
                rejected: "rejected";
                removed: "removed";
            }>;
            rejectionReason: z.ZodNullable<z.ZodString>;
            submissionCount: z.ZodNumber;
            createdAt: z.ZodISODateTime;
            updatedAt: z.ZodISODateTime;
        }, z.core.$strip>>;
        meta: z.ZodObject<{
            total: z.ZodNumber;
            hasMore: z.ZodBoolean;
            nextCursor: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, Record<never, never>>;
    getProposalCount: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
        totalCount: z.ZodNumber;
    }, z.core.$strip>, Record<never, never>>;
    getAuditLog: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
        limit: z.ZodOptional<z.ZodNumber>;
        cursor: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            action: z.ZodString;
            actor: z.ZodString;
            actorLabel: z.ZodNullable<z.ZodString>;
            details: z.ZodNullable<z.ZodUnknown>;
            createdAt: z.ZodISODateTime;
        }, z.core.$strip>>;
        meta: z.ZodObject<{
            total: z.ZodNumber;
            hasMore: z.ZodBoolean;
            nextCursor: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, Record<never, never>>;
    getSubmissions: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
        limit: z.ZodOptional<z.ZodNumber>;
        cursor: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            submittedBy: z.ZodString;
            source: z.ZodNullable<z.ZodString>;
            payload: z.ZodNullable<z.ZodUnknown>;
            metadata: z.ZodNullable<z.ZodUnknown>;
            createdAt: z.ZodISODateTime;
        }, z.core.$strip>>;
        meta: z.ZodObject<{
            total: z.ZodNumber;
            hasMore: z.ZodBoolean;
            nextCursor: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
        FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    }>;
    getMySubmission: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodString;
        entityId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        hasSubmitted: z.ZodBoolean;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>;
    getReviewHistory: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        cursor: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            pluginId: z.ZodString;
            entityId: z.ZodString;
            actor: z.ZodString;
            actorLabel: z.ZodNullable<z.ZodString>;
            details: z.ZodNullable<z.ZodUnknown>;
            createdAt: z.ZodISODateTime;
            action: z.ZodEnum<{
                approved: "approved";
                rejected: "rejected";
            }>;
            proposal: z.ZodObject<{
                id: z.ZodString;
                pluginId: z.ZodString;
                entityId: z.ZodString;
                operation: z.ZodLiteral<"create">;
                payload: z.ZodUnknown;
                schemaVersion: z.ZodString;
                createdBy: z.ZodString;
                reviewStatus: z.ZodEnum<{
                    approved: "approved";
                    pending: "pending";
                    rejected: "rejected";
                    removed: "removed";
                }>;
                rejectionReason: z.ZodNullable<z.ZodString>;
                submissionCount: z.ZodNumber;
                createdAt: z.ZodISODateTime;
                updatedAt: z.ZodISODateTime;
            }, z.core.$strip>;
        }, z.core.$strip>>;
        meta: z.ZodObject<{
            total: z.ZodNumber;
            hasMore: z.ZodBoolean;
            nextCursor: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
        FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    }>;
    subscribe: import("@orpc/contract").ProcedureContract<z.ZodObject<{
        pluginId: z.ZodOptional<z.ZodString>;
        entityId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, import("@orpc/contract").Schema<AsyncIteratorObject<{
        action: string;
        pluginId: string;
        entityId: string;
        reviewStatus: "approved" | "pending" | "rejected" | "removed";
        submissionCount: number;
        timestamp: string;
    }, unknown, void>, import("@orpc/server").AsyncIteratorClass<{
        action: string;
        pluginId: string;
        entityId: string;
        reviewStatus: "approved" | "pending" | "rejected" | "removed";
        submissionCount: number;
        timestamp: string;
    }, unknown, void>>, Record<never, never>>;
};
export type ContractType = typeof contract;
export type InferOutput<K extends keyof InferContractRouterOutputs<ContractType>> = InferContractRouterOutputs<ContractType>[K];
export type InferInput<K extends keyof InferContractRouterInputs<ContractType>> = InferContractRouterInputs<ContractType>[K];
