import "@orpc/openapi/extensions/route";
import { z } from "zod";
export declare const sessionRoutes: {
    health: import("@orpc/contract").ProcedureContractBuilderWithOutput<z.ZodObject<{
        status: z.ZodLiteral<"ok">;
        timestamp: z.ZodString;
    }, z.core.$strip>, object>;
    getSession: import("@orpc/contract").ProcedureContractBuilderWithOutput<z.ZodObject<{
        session: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            token: z.ZodString;
            userId: z.ZodString;
            expiresAt: z.ZodDate;
            activeOrganizationId: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        user: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            email: z.ZodString;
            emailVerified: z.ZodBoolean;
            image: z.ZodNullable<z.ZodString>;
            role: z.ZodNullable<z.ZodString>;
            isAnonymous: z.ZodNullable<z.ZodBoolean>;
            locale: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, {
        readonly UNAUTHORIZED: {
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
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: z.ZodObject<{
                resource: z.ZodOptional<z.ZodString>;
                resourceId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        readonly BAD_REQUEST: {
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
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: z.ZodObject<{
                retryAfter: z.ZodOptional<z.ZodNumber>;
                maintenanceWindow: z.ZodDefault<z.ZodBoolean>;
                estimatedUptime: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    }>;
    getContext: import("@orpc/contract").ProcedureContractBuilderWithOutput<z.ZodObject<{
        user: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            email: z.ZodString;
            emailVerified: z.ZodBoolean;
            image: z.ZodNullable<z.ZodString>;
            role: z.ZodNullable<z.ZodString>;
            isAnonymous: z.ZodNullable<z.ZodBoolean>;
            locale: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        userId: z.ZodNullable<z.ZodString>;
        isAuthenticated: z.ZodBoolean;
        authMethod: z.ZodEnum<{
            anonymous: "anonymous";
            apiKey: "apiKey";
            none: "none";
            session: "session";
        }>;
        principal: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
            type: z.ZodLiteral<"user">;
            userId: z.ZodString;
            user: z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                email: z.ZodString;
                emailVerified: z.ZodBoolean;
                image: z.ZodNullable<z.ZodString>;
                role: z.ZodNullable<z.ZodString>;
                isAnonymous: z.ZodNullable<z.ZodBoolean>;
                locale: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"organization">;
            organizationId: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"anonymous">;
            userId: z.ZodString;
            user: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                email: z.ZodString;
                emailVerified: z.ZodBoolean;
                image: z.ZodNullable<z.ZodString>;
                role: z.ZodNullable<z.ZodString>;
                isAnonymous: z.ZodNullable<z.ZodBoolean>;
                locale: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>]>>;
        apiKey: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
        }, z.core.$strip>>;
        permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
        near: z.ZodObject<{
            primaryAccountId: z.ZodNullable<z.ZodString>;
            linkedAccounts: z.ZodArray<z.ZodObject<{
                accountId: z.ZodString;
                network: z.ZodString;
                publicKey: z.ZodString;
                isPrimary: z.ZodBoolean;
            }, z.core.$strip>>;
            hasNearAccount: z.ZodBoolean;
        }, z.core.$strip>;
        organization: z.ZodObject<{
            activeOrganizationId: z.ZodNullable<z.ZodString>;
            organization: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                slug: z.ZodString;
                logo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                metadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
                status: z.ZodDefault<z.ZodEnum<{
                    active: "active";
                    pending: "pending";
                    rejected: "rejected";
                }>>;
                requestedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                rejectionReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>;
            member: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                role: z.ZodString;
            }, z.core.$strip>>;
            isPersonal: z.ZodBoolean;
            hasOrganization: z.ZodBoolean;
            teams: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                areas: z.ZodArray<z.ZodString>;
                permissions: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            activeTeamId: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        organizations: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            slug: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, {
        readonly UNAUTHORIZED: {
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
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: z.ZodObject<{
                requiredPermissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
                action: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: z.ZodObject<{
                resource: z.ZodOptional<z.ZodString>;
                resourceId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        readonly BAD_REQUEST: {
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
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: z.ZodObject<{
                retryAfter: z.ZodOptional<z.ZodNumber>;
                maintenanceWindow: z.ZodDefault<z.ZodBoolean>;
                estimatedUptime: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
    }>;
};
