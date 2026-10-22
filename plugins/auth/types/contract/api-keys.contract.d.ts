import "@orpc/openapi/extensions/route";
import { z } from "zod";
export declare const apiKeyRoutes: {
    listApiKeys: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        configId: z.ZodOptional<z.ZodString>;
        organizationId: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        sortBy: z.ZodOptional<z.ZodEnum<{
            createdAt: "createdAt";
            expiresAt: "expiresAt";
            lastRequest: "lastRequest";
            name: "name";
        }>>;
        sortDirection: z.ZodOptional<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        configId: z.ZodString;
        referenceId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        prefix: z.ZodNullable<z.ZodString>;
        start: z.ZodNullable<z.ZodString>;
        enabled: z.ZodBoolean;
        rateLimitEnabled: z.ZodBoolean;
        rateLimitMax: z.ZodNullable<z.ZodNumber>;
        rateLimitTimeWindow: z.ZodNullable<z.ZodNumber>;
        remaining: z.ZodNullable<z.ZodNumber>;
        requestCount: z.ZodNumber;
        lastRequest: z.ZodNullable<z.ZodDate>;
        expiresAt: z.ZodNullable<z.ZodDate>;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
        metadata: z.ZodNullable<z.ZodUnknown>;
        permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
    }, z.core.$strip>>, {
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
    createApiKey: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        prefix: z.ZodOptional<z.ZodString>;
        expiresIn: z.ZodOptional<z.ZodNumber>;
        permissions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
        metadata: z.ZodOptional<z.ZodUnknown>;
        rateLimit: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            timeWindow: z.ZodOptional<z.ZodNumber>;
            max: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        organizationId: z.ZodOptional<z.ZodString>;
        configId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        configId: z.ZodString;
        referenceId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        prefix: z.ZodNullable<z.ZodString>;
        start: z.ZodNullable<z.ZodString>;
        enabled: z.ZodBoolean;
        rateLimitEnabled: z.ZodBoolean;
        rateLimitMax: z.ZodNullable<z.ZodNumber>;
        rateLimitTimeWindow: z.ZodNullable<z.ZodNumber>;
        remaining: z.ZodNullable<z.ZodNumber>;
        requestCount: z.ZodNumber;
        lastRequest: z.ZodNullable<z.ZodDate>;
        expiresAt: z.ZodNullable<z.ZodDate>;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
        metadata: z.ZodNullable<z.ZodUnknown>;
        permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
        key: z.ZodString;
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
    updateApiKey: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        permissions: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>>;
        metadata: z.ZodOptional<z.ZodUnknown>;
        expiresIn: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rateLimit: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            timeWindow: z.ZodOptional<z.ZodNumber>;
            max: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        organizationId: z.ZodOptional<z.ZodString>;
        configId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        configId: z.ZodString;
        referenceId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        prefix: z.ZodNullable<z.ZodString>;
        start: z.ZodNullable<z.ZodString>;
        enabled: z.ZodBoolean;
        rateLimitEnabled: z.ZodBoolean;
        rateLimitMax: z.ZodNullable<z.ZodNumber>;
        rateLimitTimeWindow: z.ZodNullable<z.ZodNumber>;
        remaining: z.ZodNullable<z.ZodNumber>;
        requestCount: z.ZodNumber;
        lastRequest: z.ZodNullable<z.ZodDate>;
        expiresAt: z.ZodNullable<z.ZodDate>;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
        metadata: z.ZodNullable<z.ZodUnknown>;
        permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
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
    deleteApiKey: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        id: z.ZodString;
        organizationId: z.ZodOptional<z.ZodString>;
        configId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        success: z.ZodBoolean;
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
    verifyApiKey: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
        key: z.ZodString;
        configId: z.ZodOptional<z.ZodString>;
        permissions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
    }, z.core.$strip>, z.ZodObject<{
        valid: z.ZodBoolean;
        error: z.ZodNullable<z.ZodObject<{
            code: z.ZodString;
            message: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        key: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            configId: z.ZodString;
            referenceId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            prefix: z.ZodNullable<z.ZodString>;
            start: z.ZodNullable<z.ZodString>;
            enabled: z.ZodBoolean;
            rateLimitEnabled: z.ZodBoolean;
            rateLimitMax: z.ZodNullable<z.ZodNumber>;
            rateLimitTimeWindow: z.ZodNullable<z.ZodNumber>;
            remaining: z.ZodNullable<z.ZodNumber>;
            requestCount: z.ZodNumber;
            lastRequest: z.ZodNullable<z.ZodDate>;
            expiresAt: z.ZodNullable<z.ZodDate>;
            createdAt: z.ZodDate;
            updatedAt: z.ZodDate;
            metadata: z.ZodNullable<z.ZodUnknown>;
            permissions: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
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
};
