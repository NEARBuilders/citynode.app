import type { InferContractRouterInputs, InferContractRouterOutputs } from "@orpc/contract";
export { type AuthErrors, Errors } from "./contract/errors";
export { apiKeySchema } from "./contract/schemas";
export declare const contract: {
    adminListUsers: import("@orpc/contract").ProcedureContract<import("zod").ZodOptional<import("zod").ZodObject<{
        searchValue: import("zod").ZodOptional<import("zod").ZodString>;
        searchField: import("zod").ZodOptional<import("zod").ZodEnum<{
            email: "email";
            name: "name";
        }>>;
        limit: import("zod").ZodOptional<import("zod").ZodNumber>;
        offset: import("zod").ZodOptional<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>>, import("zod").ZodObject<{
        users: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            email: import("zod").ZodString;
            emailVerified: import("zod").ZodBoolean;
            image: import("zod").ZodNullable<import("zod").ZodString>;
            isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
            locale: import("zod").ZodNullable<import("zod").ZodString>;
            role: import("zod").ZodNullable<import("zod").ZodString>;
            banned: import("zod").ZodNullable<import("zod").ZodBoolean>;
            banReason: import("zod").ZodNullable<import("zod").ZodString>;
            banExpires: import("zod").ZodNullable<import("zod").ZodDate>;
            createdAt: import("zod").ZodDate;
            updatedAt: import("zod").ZodDate;
        }, import("zod/v4/core").$strip>>;
        total: import("zod").ZodNumber;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminGetUser: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        email: import("zod").ZodString;
        emailVerified: import("zod").ZodBoolean;
        image: import("zod").ZodNullable<import("zod").ZodString>;
        isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
        locale: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        banned: import("zod").ZodNullable<import("zod").ZodBoolean>;
        banReason: import("zod").ZodNullable<import("zod").ZodString>;
        banExpires: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminSetRole: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
        role: import("zod").ZodEnum<{
            admin: "admin";
            user: "user";
        }>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        email: import("zod").ZodString;
        emailVerified: import("zod").ZodBoolean;
        image: import("zod").ZodNullable<import("zod").ZodString>;
        isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
        locale: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        banned: import("zod").ZodNullable<import("zod").ZodBoolean>;
        banReason: import("zod").ZodNullable<import("zod").ZodString>;
        banExpires: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminBanUser: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
        banReason: import("zod").ZodOptional<import("zod").ZodString>;
        banExpiresIn: import("zod").ZodOptional<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        email: import("zod").ZodString;
        emailVerified: import("zod").ZodBoolean;
        image: import("zod").ZodNullable<import("zod").ZodString>;
        isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
        locale: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        banned: import("zod").ZodNullable<import("zod").ZodBoolean>;
        banReason: import("zod").ZodNullable<import("zod").ZodString>;
        banExpires: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminUnbanUser: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        email: import("zod").ZodString;
        emailVerified: import("zod").ZodBoolean;
        image: import("zod").ZodNullable<import("zod").ZodString>;
        isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
        locale: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        banned: import("zod").ZodNullable<import("zod").ZodBoolean>;
        banReason: import("zod").ZodNullable<import("zod").ZodString>;
        banExpires: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminListUserSessions: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        sessions: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            token: import("zod").ZodString;
            userId: import("zod").ZodString;
            expiresAt: import("zod").ZodDate;
            createdAt: import("zod").ZodDate;
            updatedAt: import("zod").ZodDate;
            ipAddress: import("zod").ZodNullable<import("zod").ZodString>;
            userAgent: import("zod").ZodNullable<import("zod").ZodString>;
            impersonatedBy: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminRevokeUserSession: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        sessionToken: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminRevokeUserSessions: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminSetUserPassword: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
        newPassword: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    adminRemoveUser: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listApiKeys: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        configId: import("zod").ZodOptional<import("zod").ZodString>;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        limit: import("zod").ZodOptional<import("zod").ZodNumber>;
        offset: import("zod").ZodOptional<import("zod").ZodNumber>;
        sortBy: import("zod").ZodOptional<import("zod").ZodEnum<{
            createdAt: "createdAt";
            expiresAt: "expiresAt";
            lastRequest: "lastRequest";
            name: "name";
        }>>;
        sortDirection: import("zod").ZodOptional<import("zod").ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        configId: import("zod").ZodString;
        referenceId: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        prefix: import("zod").ZodNullable<import("zod").ZodString>;
        start: import("zod").ZodNullable<import("zod").ZodString>;
        enabled: import("zod").ZodBoolean;
        rateLimitEnabled: import("zod").ZodBoolean;
        rateLimitMax: import("zod").ZodNullable<import("zod").ZodNumber>;
        rateLimitTimeWindow: import("zod").ZodNullable<import("zod").ZodNumber>;
        remaining: import("zod").ZodNullable<import("zod").ZodNumber>;
        requestCount: import("zod").ZodNumber;
        lastRequest: import("zod").ZodNullable<import("zod").ZodDate>;
        expiresAt: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
        metadata: import("zod").ZodNullable<import("zod").ZodUnknown>;
        permissions: import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    createApiKey: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        name: import("zod").ZodOptional<import("zod").ZodString>;
        prefix: import("zod").ZodOptional<import("zod").ZodString>;
        expiresIn: import("zod").ZodOptional<import("zod").ZodNumber>;
        permissions: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
        metadata: import("zod").ZodOptional<import("zod").ZodUnknown>;
        rateLimit: import("zod").ZodOptional<import("zod").ZodObject<{
            enabled: import("zod").ZodOptional<import("zod").ZodBoolean>;
            timeWindow: import("zod").ZodOptional<import("zod").ZodNumber>;
            max: import("zod").ZodOptional<import("zod").ZodNumber>;
        }, import("zod/v4/core").$strip>>;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        configId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        configId: import("zod").ZodString;
        referenceId: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        prefix: import("zod").ZodNullable<import("zod").ZodString>;
        start: import("zod").ZodNullable<import("zod").ZodString>;
        enabled: import("zod").ZodBoolean;
        rateLimitEnabled: import("zod").ZodBoolean;
        rateLimitMax: import("zod").ZodNullable<import("zod").ZodNumber>;
        rateLimitTimeWindow: import("zod").ZodNullable<import("zod").ZodNumber>;
        remaining: import("zod").ZodNullable<import("zod").ZodNumber>;
        requestCount: import("zod").ZodNumber;
        lastRequest: import("zod").ZodNullable<import("zod").ZodDate>;
        expiresAt: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
        metadata: import("zod").ZodNullable<import("zod").ZodUnknown>;
        permissions: import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
        key: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    updateApiKey: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodOptional<import("zod").ZodString>;
        enabled: import("zod").ZodOptional<import("zod").ZodBoolean>;
        permissions: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>>;
        metadata: import("zod").ZodOptional<import("zod").ZodUnknown>;
        expiresIn: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodNumber>>;
        rateLimit: import("zod").ZodOptional<import("zod").ZodObject<{
            enabled: import("zod").ZodOptional<import("zod").ZodBoolean>;
            timeWindow: import("zod").ZodOptional<import("zod").ZodNumber>;
            max: import("zod").ZodOptional<import("zod").ZodNumber>;
        }, import("zod/v4/core").$strip>>;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        configId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        configId: import("zod").ZodString;
        referenceId: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        prefix: import("zod").ZodNullable<import("zod").ZodString>;
        start: import("zod").ZodNullable<import("zod").ZodString>;
        enabled: import("zod").ZodBoolean;
        rateLimitEnabled: import("zod").ZodBoolean;
        rateLimitMax: import("zod").ZodNullable<import("zod").ZodNumber>;
        rateLimitTimeWindow: import("zod").ZodNullable<import("zod").ZodNumber>;
        remaining: import("zod").ZodNullable<import("zod").ZodNumber>;
        requestCount: import("zod").ZodNumber;
        lastRequest: import("zod").ZodNullable<import("zod").ZodDate>;
        expiresAt: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
        metadata: import("zod").ZodNullable<import("zod").ZodUnknown>;
        permissions: import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    deleteApiKey: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        id: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        configId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    verifyApiKey: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        key: import("zod").ZodString;
        configId: import("zod").ZodOptional<import("zod").ZodString>;
        permissions: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        valid: import("zod").ZodBoolean;
        error: import("zod").ZodNullable<import("zod").ZodObject<{
            code: import("zod").ZodString;
            message: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
        key: import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            configId: import("zod").ZodString;
            referenceId: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            prefix: import("zod").ZodNullable<import("zod").ZodString>;
            start: import("zod").ZodNullable<import("zod").ZodString>;
            enabled: import("zod").ZodBoolean;
            rateLimitEnabled: import("zod").ZodBoolean;
            rateLimitMax: import("zod").ZodNullable<import("zod").ZodNumber>;
            rateLimitTimeWindow: import("zod").ZodNullable<import("zod").ZodNumber>;
            remaining: import("zod").ZodNullable<import("zod").ZodNumber>;
            requestCount: import("zod").ZodNumber;
            lastRequest: import("zod").ZodNullable<import("zod").ZodDate>;
            expiresAt: import("zod").ZodNullable<import("zod").ZodDate>;
            createdAt: import("zod").ZodDate;
            updatedAt: import("zod").ZodDate;
            metadata: import("zod").ZodNullable<import("zod").ZodUnknown>;
            permissions: import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
        }, import("zod/v4/core").$strip>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    provisionCommunityOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        proposalId: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        proposerAccountId: import("zod").ZodString;
        proposerUserId: import("zod").ZodOptional<import("zod").ZodString>;
        legacyOrgId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    releaseCommunityOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        proposalId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        released: import("zod").ZodBoolean;
        keptReason: import("zod").ZodNullable<import("zod").ZodEnum<{
            in_use: "in_use";
            not_found: "not_found";
        }>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    inviteMember: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        email: import("zod").ZodOptional<import("zod").ZodString>;
        nearAccountId: import("zod").ZodOptional<import("zod").ZodString>;
        nearNetwork: import("zod").ZodOptional<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
        role: import("zod").ZodEnum<{
            admin: "admin";
            member: "member";
            owner: "owner";
        }>;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        teamId: import("zod").ZodOptional<import("zod").ZodString>;
        resend: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        email: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        status: import("zod").ZodString;
        expiresAt: import("zod").ZodDate;
        inviterId: import("zod").ZodString;
        teamId: import("zod").ZodNullable<import("zod").ZodString>;
        nearAccountId: import("zod").ZodNullable<import("zod").ZodString>;
        nearNetwork: import("zod").ZodNullable<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getInvitation: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodNullable<import("zod").ZodObject<{
        id: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        email: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        status: import("zod").ZodString;
        expiresAt: import("zod").ZodDate;
        inviterId: import("zod").ZodString;
        teamId: import("zod").ZodNullable<import("zod").ZodString>;
        nearAccountId: import("zod").ZodNullable<import("zod").ZodString>;
        nearNetwork: import("zod").ZodNullable<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
        organizationName: import("zod").ZodString;
        organizationSlug: import("zod").ZodString;
        inviterName: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listInvitations: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        email: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        status: import("zod").ZodString;
        expiresAt: import("zod").ZodDate;
        inviterId: import("zod").ZodString;
        teamId: import("zod").ZodNullable<import("zod").ZodString>;
        nearAccountId: import("zod").ZodNullable<import("zod").ZodString>;
        nearNetwork: import("zod").ZodNullable<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listUserInvitations: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        email: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        status: import("zod").ZodString;
        expiresAt: import("zod").ZodDate;
        inviterId: import("zod").ZodString;
        teamId: import("zod").ZodNullable<import("zod").ZodString>;
        nearAccountId: import("zod").ZodNullable<import("zod").ZodString>;
        nearNetwork: import("zod").ZodNullable<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
        organizationName: import("zod").ZodOptional<import("zod").ZodString>;
        organizationSlug: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    cancelInvitation: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        invitationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    acceptInvitation: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        invitationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    acceptNearInvitation: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        invitationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    rejectNearInvitation: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        invitationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    rejectInvitation: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        invitationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getActiveMember: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodNullable<import("zod").ZodString>;
        organizationId: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getActiveMemberRole: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        role: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listMembers: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        limit: import("zod").ZodOptional<import("zod").ZodNumber>;
        offset: import("zod").ZodOptional<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        members: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            userId: import("zod").ZodString;
            organizationId: import("zod").ZodString;
            role: import("zod").ZodString;
            createdAt: import("zod").ZodDate;
            user: import("zod").ZodNullable<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodNullable<import("zod").ZodString>;
                email: import("zod").ZodNullable<import("zod").ZodString>;
                image: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>>;
        total: import("zod").ZodNumber;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    exportMembers: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        csv: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    addMember: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        userId: import("zod").ZodString;
        role: import("zod").ZodEnum<{
            admin: "admin";
            member: "member";
            owner: "owner";
        }>;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        userId: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        role: import("zod").ZodString;
        createdAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    removeMember: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        memberIdOrEmail: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    updateMemberRole: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        role: import("zod").ZodEnum<{
            admin: "admin";
            member: "member";
            owner: "owner";
        }>;
        memberId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        userId: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        role: import("zod").ZodString;
        createdAt: import("zod").ZodDate;
        user: import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            email: import("zod").ZodNullable<import("zod").ZodString>;
            image: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearNonce: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        accountId: import("zod").ZodString;
        networkId: import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        nonce: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearVerify: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        signedMessage: import("zod").ZodObject<{
            accountId: import("zod").ZodString;
            publicKey: import("zod").ZodString;
            signature: import("zod").ZodString;
            state: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>;
        message: import("zod").ZodString;
        recipient: import("zod").ZodString;
        nonce: import("zod").ZodString;
        accountId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        token: import("zod").ZodString;
        success: import("zod").ZodLiteral<true>;
        user: import("zod").ZodObject<{
            id: import("zod").ZodString;
            accountId: import("zod").ZodString;
            network: import("zod").ZodEnum<{
                mainnet: "mainnet";
                testnet: "testnet";
            }>;
        }, import("zod/v4/core").$strip>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearProfile: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        accountId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodNullable<import("zod").ZodObject<{
        name: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        image: import("zod").ZodOptional<import("zod").ZodObject<{
            url: import("zod").ZodOptional<import("zod").ZodString>;
            ipfs_cid: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
        backgroundImage: import("zod").ZodOptional<import("zod").ZodObject<{
            url: import("zod").ZodOptional<import("zod").ZodString>;
            ipfs_cid: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
        linktree: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearLinkAccount: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        signedMessage: import("zod").ZodObject<{
            accountId: import("zod").ZodString;
            publicKey: import("zod").ZodString;
            signature: import("zod").ZodString;
            state: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>;
        message: import("zod").ZodString;
        recipient: import("zod").ZodString;
        nonce: import("zod").ZodString;
        accountId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
        accountId: import("zod").ZodString;
        network: import("zod").ZodString;
        message: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearUnlinkAccount: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        accountId: import("zod").ZodString;
        network: import("zod").ZodOptional<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
        accountId: import("zod").ZodString;
        network: import("zod").ZodString;
        message: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearListAccounts: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodObject<{
        accounts: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            userId: import("zod").ZodString;
            accountId: import("zod").ZodString;
            network: import("zod").ZodString;
            publicKey: import("zod").ZodString;
            providerId: import("zod").ZodOptional<import("zod").ZodLiteral<"siwn">>;
            isPrimary: import("zod").ZodBoolean;
            isActive: import("zod").ZodOptional<import("zod").ZodBoolean>;
            isAvailable: import("zod").ZodOptional<import("zod").ZodBoolean>;
            createdAt: import("zod").ZodDate;
        }, import("zod/v4/core").$strip>>;
        activeAccount: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            userId: import("zod").ZodString;
            accountId: import("zod").ZodString;
            network: import("zod").ZodString;
            publicKey: import("zod").ZodString;
            providerId: import("zod").ZodOptional<import("zod").ZodLiteral<"siwn">>;
            isPrimary: import("zod").ZodBoolean;
            isActive: import("zod").ZodOptional<import("zod").ZodBoolean>;
            isAvailable: import("zod").ZodOptional<import("zod").ZodBoolean>;
            createdAt: import("zod").ZodDate;
        }, import("zod/v4/core").$strip>>>;
        availableAccounts: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            userId: import("zod").ZodString;
            accountId: import("zod").ZodString;
            network: import("zod").ZodString;
            publicKey: import("zod").ZodString;
            providerId: import("zod").ZodOptional<import("zod").ZodLiteral<"siwn">>;
            isPrimary: import("zod").ZodBoolean;
            isActive: import("zod").ZodOptional<import("zod").ZodBoolean>;
            isAvailable: import("zod").ZodOptional<import("zod").ZodBoolean>;
            createdAt: import("zod").ZodDate;
        }, import("zod/v4/core").$strip>>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearRelay: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        payload: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        txHash: import("zod").ZodString;
        status: import("zod").ZodEnum<{
            completed: "completed";
            failed: "failed";
            pending: "pending";
        }>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearRelayStatus: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        txHash: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodEnum<{
            completed: "completed";
            failed: "failed";
            pending: "pending";
        }>;
        gasUsed: import("zod").ZodOptional<import("zod").ZodString>;
        outcome: import("zod").ZodOptional<import("zod").ZodUnknown>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearRelayerInfo: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        network: import("zod").ZodOptional<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        enabled: import("zod").ZodBoolean;
        accountId: import("zod").ZodOptional<import("zod").ZodString>;
        mode: import("zod").ZodOptional<import("zod").ZodEnum<{
            ephemeral: "ephemeral";
            explicit: "explicit";
        }>>;
        network: import("zod").ZodOptional<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
        balance: import("zod").ZodOptional<import("zod").ZodString>;
        available: import("zod").ZodOptional<import("zod").ZodString>;
        staked: import("zod").ZodOptional<import("zod").ZodString>;
        storageUsage: import("zod").ZodOptional<import("zod").ZodString>;
        storageBytes: import("zod").ZodOptional<import("zod").ZodNumber>;
        hasContract: import("zod").ZodOptional<import("zod").ZodBoolean>;
        hasKey: import("zod").ZodOptional<import("zod").ZodBoolean>;
        publicKey: import("zod").ZodOptional<import("zod").ZodString>;
        createdAt: import("zod").ZodOptional<import("zod").ZodString>;
        lastUsedAt: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearRelayHistory: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodObject<{
        transactions: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            userId: import("zod").ZodString;
            txHash: import("zod").ZodString;
            senderId: import("zod").ZodString;
            receiverId: import("zod").ZodString;
            network: import("zod").ZodString;
            status: import("zod").ZodString;
            gasUsed: import("zod").ZodOptional<import("zod").ZodString>;
            createdAt: import("zod").ZodString;
            updatedAt: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearView: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        contractId: import("zod").ZodString;
        methodName: import("zod").ZodString;
        args: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodAny>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        result: import("zod").ZodUnknown;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearCheckSubAccountAvailability: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        subAccountName: import("zod").ZodString;
        network: import("zod").ZodOptional<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        available: import("zod").ZodBoolean;
        accountId: import("zod").ZodString;
        parentAccount: import("zod").ZodOptional<import("zod").ZodString>;
        reason: import("zod").ZodOptional<import("zod").ZodEnum<{
            invalid: "invalid";
            "not-configured": "not-configured";
            taken: "taken";
            "too-long": "too-long";
        }>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    nearCreateSubAccount: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        subAccountName: import("zod").ZodString;
        publicKey: import("zod").ZodString;
        network: import("zod").ZodOptional<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
        accountId: import("zod").ZodString;
        txHash: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    createOnboardingCode: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        eventId: import("zod").ZodString;
        eventName: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        maxUses: import("zod").ZodOptional<import("zod").ZodNumber>;
        expiresAt: import("zod").ZodOptional<import("zod").ZodDate>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        eventId: import("zod").ZodNullable<import("zod").ZodString>;
        eventName: import("zod").ZodString;
        teamId: import("zod").ZodString;
        role: import("zod").ZodString;
        maxUses: import("zod").ZodNumber;
        usedCount: import("zod").ZodNumber;
        expiresAt: import("zod").ZodDate;
        revokedAt: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        code: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listOnboardingCodes: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        eventId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        eventId: import("zod").ZodNullable<import("zod").ZodString>;
        eventName: import("zod").ZodString;
        teamId: import("zod").ZodString;
        role: import("zod").ZodString;
        maxUses: import("zod").ZodNumber;
        usedCount: import("zod").ZodNumber;
        expiresAt: import("zod").ZodDate;
        revokedAt: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    revokeOnboardingCode: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        codeId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getOnboardingStation: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        codeId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        eventId: import("zod").ZodNullable<import("zod").ZodString>;
        eventName: import("zod").ZodString;
        teamId: import("zod").ZodString;
        role: import("zod").ZodString;
        maxUses: import("zod").ZodNumber;
        usedCount: import("zod").ZodNumber;
        expiresAt: import("zod").ZodDate;
        revokedAt: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        code: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getOnboardingStatus: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        codeId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        eventId: import("zod").ZodNullable<import("zod").ZodString>;
        eventName: import("zod").ZodString;
        teamId: import("zod").ZodString;
        role: import("zod").ZodString;
        maxUses: import("zod").ZodNumber;
        usedCount: import("zod").ZodNumber;
        expiresAt: import("zod").ZodDate;
        revokedAt: import("zod").ZodNullable<import("zod").ZodDate>;
        createdAt: import("zod").ZodDate;
        joined: import("zod").ZodArray<import("zod").ZodObject<{
            userId: import("zod").ZodString;
            userName: import("zod").ZodNullable<import("zod").ZodString>;
            accountId: import("zod").ZodNullable<import("zod").ZodString>;
            createdAt: import("zod").ZodDate;
        }, import("zod/v4/core").$strip>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getOnboardingCodeInfo: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        code: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodNullable<import("zod").ZodObject<{
        organizationName: import("zod").ZodString;
        eventName: import("zod").ZodString;
        inviterName: import("zod").ZodNullable<import("zod").ZodString>;
        role: import("zod").ZodString;
        expired: import("zod").ZodBoolean;
        revoked: import("zod").ZodBoolean;
        usedUp: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    redeemOnboardingCode: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        code: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
        alreadyRedeemed: import("zod").ZodBoolean;
        organizationId: import("zod").ZodString;
        organizationName: import("zod").ZodString;
        eventName: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listOnboardingJoins: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        month: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        month: import("zod").ZodString;
        totals: import("zod").ZodObject<{
            redeemed: import("zod").ZodNumber;
            newMembers: import("zod").ZodNumber;
        }, import("zod/v4/core").$strip>;
        organizations: import("zod").ZodArray<import("zod").ZodObject<{
            organizationId: import("zod").ZodString;
            redeemed: import("zod").ZodNumber;
            newMembers: import("zod").ZodNumber;
        }, import("zod/v4/core").$strip>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getOnboardingRedemptions: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        thisMonth: import("zod").ZodObject<{
            month: import("zod").ZodString;
            redeemed: import("zod").ZodNumber;
            newMembers: import("zod").ZodNumber;
        }, import("zod/v4/core").$strip>;
        lastMonth: import("zod").ZodObject<{
            month: import("zod").ZodString;
            redeemed: import("zod").ZodNumber;
            newMembers: import("zod").ZodNumber;
        }, import("zod/v4/core").$strip>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listOrganizationRequests: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        createdAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    reviewOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
        decision: import("zod").ZodLiteral<"approve">;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
        decision: import("zod").ZodLiteral<"reject">;
        reason: import("zod").ZodString;
    }, import("zod/v4/core").$strip>], "decision">, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listOrganizations: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        createdAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getFullOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        organizationSlug: import("zod").ZodOptional<import("zod").ZodString>;
        membersLimit: import("zod").ZodOptional<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>, import("zod").ZodNullable<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        createdAt: import("zod").ZodDate;
        members: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            userId: import("zod").ZodString;
            organizationId: import("zod").ZodString;
            role: import("zod").ZodString;
            createdAt: import("zod").ZodDate;
        }, import("zod/v4/core").$strip>>;
        invitations: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            organizationId: import("zod").ZodString;
            email: import("zod").ZodNullable<import("zod").ZodString>;
            role: import("zod").ZodNullable<import("zod").ZodString>;
            status: import("zod").ZodString;
            expiresAt: import("zod").ZodDate;
            inviterId: import("zod").ZodString;
            teamId: import("zod").ZodNullable<import("zod").ZodString>;
            nearAccountId: import("zod").ZodNullable<import("zod").ZodString>;
            nearNetwork: import("zod").ZodNullable<import("zod").ZodEnum<{
                mainnet: "mainnet";
                testnet: "testnet";
            }>>;
        }, import("zod/v4/core").$strip>>;
        teams: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            organizationId: import("zod").ZodString;
            areas: import("zod").ZodArray<import("zod").ZodString>;
            createdAt: import("zod").ZodDate;
            updatedAt: import("zod").ZodDate;
        }, import("zod/v4/core").$strip>>>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getOrganizationForAdmin: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodNullable<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    createOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodString>;
        metadata: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        createdAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    setActiveOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    updateOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        data: import("zod").ZodObject<{
            name: import("zod").ZodOptional<import("zod").ZodString>;
            slug: import("zod").ZodOptional<import("zod").ZodString>;
            logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
            metadata: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>;
        }, import("zod/v4/core").$strip>;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        slug: import("zod").ZodString;
        logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
        status: import("zod").ZodDefault<import("zod").ZodEnum<{
            active: "active";
            pending: "pending";
            rejected: "rejected";
        }>>;
        requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    leaveOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    deleteOrganization: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    checkSlug: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        slug: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    hasPermission: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        permissions: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    linkDao: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
        daoAccountId: import("zod").ZodString;
        daoNetwork: import("zod").ZodOptional<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    unlinkDao: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getDao: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        daoAccountId: import("zod").ZodNullable<import("zod").ZodString>;
        daoNetwork: import("zod").ZodNullable<import("zod").ZodEnum<{
            mainnet: "mainnet";
            testnet: "testnet";
        }>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listUserPasskeys: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        publicKey: import("zod").ZodString;
        userId: import("zod").ZodString;
        credentialID: import("zod").ZodString;
        counter: import("zod").ZodNumber;
        deviceType: import("zod").ZodString;
        backedUp: import("zod").ZodBoolean;
        transports: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodDate;
        aaguid: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    health: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodObject<{
        status: import("zod").ZodLiteral<"ok">;
        timestamp: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, object>;
    getSession: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodObject<{
        session: import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            token: import("zod").ZodString;
            userId: import("zod").ZodString;
            expiresAt: import("zod").ZodDate;
            activeOrganizationId: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
        user: import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            email: import("zod").ZodString;
            emailVerified: import("zod").ZodBoolean;
            image: import("zod").ZodNullable<import("zod").ZodString>;
            role: import("zod").ZodNullable<import("zod").ZodString>;
            isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
            locale: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    getContext: import("@orpc/contract").ProcedureContract<import("@orpc/contract").InitialInputSchema, import("zod").ZodObject<{
        user: import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            email: import("zod").ZodString;
            emailVerified: import("zod").ZodBoolean;
            image: import("zod").ZodNullable<import("zod").ZodString>;
            role: import("zod").ZodNullable<import("zod").ZodString>;
            isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
            locale: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>;
        userId: import("zod").ZodNullable<import("zod").ZodString>;
        isAuthenticated: import("zod").ZodBoolean;
        authMethod: import("zod").ZodEnum<{
            anonymous: "anonymous";
            apiKey: "apiKey";
            none: "none";
            session: "session";
        }>;
        principal: import("zod").ZodNullable<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
            type: import("zod").ZodLiteral<"user">;
            userId: import("zod").ZodString;
            user: import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodString;
                email: import("zod").ZodString;
                emailVerified: import("zod").ZodBoolean;
                image: import("zod").ZodNullable<import("zod").ZodString>;
                role: import("zod").ZodNullable<import("zod").ZodString>;
                isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
                locale: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
            type: import("zod").ZodLiteral<"organization">;
            organizationId: import("zod").ZodString;
        }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
            type: import("zod").ZodLiteral<"anonymous">;
            userId: import("zod").ZodString;
            user: import("zod").ZodNullable<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodString;
                email: import("zod").ZodString;
                emailVerified: import("zod").ZodBoolean;
                image: import("zod").ZodNullable<import("zod").ZodString>;
                role: import("zod").ZodNullable<import("zod").ZodString>;
                isAnonymous: import("zod").ZodNullable<import("zod").ZodBoolean>;
                locale: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>]>>;
        apiKey: import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            permissions: import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
        }, import("zod/v4/core").$strip>>;
        permissions: import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>>;
        near: import("zod").ZodObject<{
            primaryAccountId: import("zod").ZodNullable<import("zod").ZodString>;
            linkedAccounts: import("zod").ZodArray<import("zod").ZodObject<{
                accountId: import("zod").ZodString;
                network: import("zod").ZodString;
                publicKey: import("zod").ZodString;
                isPrimary: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strip>>;
            hasNearAccount: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strip>;
        organization: import("zod").ZodObject<{
            activeOrganizationId: import("zod").ZodNullable<import("zod").ZodString>;
            organization: import("zod").ZodNullable<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodString;
                slug: import("zod").ZodString;
                logo: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                metadata: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>>;
                status: import("zod").ZodDefault<import("zod").ZodEnum<{
                    active: "active";
                    pending: "pending";
                    rejected: "rejected";
                }>>;
                requestedBy: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                rejectionReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
            }, import("zod/v4/core").$strip>>;
            member: import("zod").ZodNullable<import("zod").ZodObject<{
                id: import("zod").ZodString;
                role: import("zod").ZodString;
            }, import("zod/v4/core").$strip>>;
            isPersonal: import("zod").ZodBoolean;
            hasOrganization: import("zod").ZodBoolean;
            teams: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodString;
                areas: import("zod").ZodArray<import("zod").ZodString>;
                permissions: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodArray<import("zod").ZodString>>;
            }, import("zod/v4/core").$strip>>;
            activeTeamId: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>;
        organizations: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            role: import("zod").ZodString;
            name: import("zod").ZodOptional<import("zod").ZodString>;
            slug: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strip>>>;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    createTeam: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        name: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        areas: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        areas: import("zod").ZodArray<import("zod").ZodString>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    updateTeam: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        teamId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        data: import("zod").ZodObject<{
            name: import("zod").ZodOptional<import("zod").ZodString>;
            areas: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        }, import("zod/v4/core").$strip>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        areas: import("zod").ZodArray<import("zod").ZodString>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    deleteTeam: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        teamId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listTeams: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        areas: import("zod").ZodArray<import("zod").ZodString>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    setActiveTeam: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        teamId: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodNullable<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        areas: import("zod").ZodArray<import("zod").ZodString>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listUserTeams: import("@orpc/contract").ProcedureContract<import("zod").ZodOptional<import("zod").ZodObject<{
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        organizationId: import("zod").ZodString;
        areas: import("zod").ZodArray<import("zod").ZodString>;
        createdAt: import("zod").ZodDate;
        updatedAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    listTeamMembers: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        teamId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        teamId: import("zod").ZodString;
        userId: import("zod").ZodString;
        role: import("zod").ZodString;
        createdAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    addTeamMember: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        teamId: import("zod").ZodString;
        userId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
        role: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        teamId: import("zod").ZodString;
        userId: import("zod").ZodString;
        role: import("zod").ZodString;
        createdAt: import("zod").ZodDate;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
    removeTeamMember: import("@orpc/contract").ProcedureContract<import("zod").ZodObject<{
        teamId: import("zod").ZodString;
        userId: import("zod").ZodString;
        organizationId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        success: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strip>, {
        readonly UNAUTHORIZED: {
            readonly status: 401;
            readonly data: import("zod").ZodObject<{
                apiKeyProvided: import("zod").ZodBoolean;
                provider: import("zod").ZodOptional<import("zod").ZodString>;
                authType: import("zod").ZodOptional<import("zod").ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly FORBIDDEN: {
            readonly status: 403;
            readonly data: import("zod").ZodObject<{
                requiredPermissions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                action: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly NOT_FOUND: {
            readonly status: 404;
            readonly data: import("zod").ZodObject<{
                resource: import("zod").ZodOptional<import("zod").ZodString>;
                resourceId: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
        readonly BAD_REQUEST: {
            readonly status: 400;
            readonly data: import("zod").ZodObject<{
                invalidFields: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
                validationErrors: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                    field: import("zod").ZodString;
                    message: import("zod").ZodString;
                    code: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strip>>>;
            }, import("zod/v4/core").$strip>;
        };
        readonly SERVICE_UNAVAILABLE: {
            readonly status: 503;
            readonly data: import("zod").ZodObject<{
                retryAfter: import("zod").ZodOptional<import("zod").ZodNumber>;
                maintenanceWindow: import("zod").ZodDefault<import("zod").ZodBoolean>;
                estimatedUptime: import("zod").ZodOptional<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
        };
    }>;
};
export type ContractType = typeof contract;
export type InferOutput<K extends keyof InferContractRouterOutputs<ContractType>> = InferContractRouterOutputs<ContractType>[K];
export type InferInput<K extends keyof InferContractRouterInputs<ContractType>> = InferContractRouterInputs<ContractType>[K];
