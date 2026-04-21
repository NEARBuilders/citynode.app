import { z } from "every-plugin/zod";
export declare const ServerStatusSchema: z.ZodObject<{
    running: z.ZodBoolean;
    port: z.ZodNumber;
    host: z.ZodString;
    url: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    uptime: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const StartServerResultSchema: z.ZodObject<{
    status: z.ZodEnum<{
        started: "started";
        already_running: "already_running";
        unavailable: "unavailable";
    }>;
    url: z.ZodString;
    message: z.ZodString;
}, z.core.$strip>;
export declare const SessionSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const PromptResultSchema: z.ZodObject<{
    sessionId: z.ZodString;
    messageId: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        error: "error";
        sent: "sent";
    }>;
}, z.core.$strip>;
export declare const ServerEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"status">;
    data: z.ZodObject<{
        running: z.ZodBoolean;
        port: z.ZodNumber;
        host: z.ZodString;
        url: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
        uptime: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"message">;
    sessionId: z.ZodString;
    content: z.ZodString;
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
        system: "system";
    }>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"session">;
    sessionId: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "type">;
export declare const contract: {
    serverStatus: import("@orpc/contract").ContractProcedure<import("@orpc/contract").Schema<unknown, unknown>, z.ZodObject<{
        data: z.ZodObject<{
            running: z.ZodBoolean;
            port: z.ZodNumber;
            host: z.ZodString;
            url: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            uptime: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
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
    }>>, Record<never, never>>;
    startServer: import("@orpc/contract").ContractProcedure<import("@orpc/contract").Schema<unknown, unknown>, z.ZodObject<{
        data: z.ZodObject<{
            status: z.ZodEnum<{
                started: "started";
                already_running: "already_running";
                unavailable: "unavailable";
            }>;
            url: z.ZodString;
            message: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
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
    }>>, Record<never, never>>;
    createSession: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodObject<{
            id: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
            createdAt: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
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
    }>>, Record<never, never>>;
    sendPrompt: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        sessionId: z.ZodString;
        message: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodObject<{
            sessionId: z.ZodString;
            messageId: z.ZodOptional<z.ZodString>;
            status: z.ZodEnum<{
                error: "error";
                sent: "sent";
            }>;
        }, z.core.$strip>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
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
    }>>, Record<never, never>>;
    events: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        sessionId: z.ZodOptional<z.ZodString>;
        lastEventId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, import("@orpc/contract").Schema<AsyncIteratorObject<{
        type: "status";
        data: {
            running: boolean;
            port: number;
            host: string;
            url: string;
            version?: string | undefined;
            uptime?: number | undefined;
        };
    } | {
        type: "message";
        sessionId: string;
        content: string;
        role: "user" | "assistant" | "system";
    } | {
        type: "session";
        sessionId: string;
        title?: string | undefined;
    }, unknown, void>, import("@orpc/contract").AsyncIteratorClass<{
        type: "status";
        data: {
            running: boolean;
            port: number;
            host: string;
            url: string;
            version?: string | undefined;
            uptime?: number | undefined;
        };
    } | {
        type: "message";
        sessionId: string;
        content: string;
        role: "user" | "assistant" | "system";
    } | {
        type: "session";
        sessionId: string;
        title?: string | undefined;
    }, unknown, void>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
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
    }>>, Record<never, never>>;
};
export type ContractType = typeof contract;
