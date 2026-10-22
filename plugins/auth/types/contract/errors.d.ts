import type { ORPCErrorConstructorMap } from "@orpc/contract";
export declare const Errors: {
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
};
export type AuthErrors = ORPCErrorConstructorMap<typeof Errors>;
