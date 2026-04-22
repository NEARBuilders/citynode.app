import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import type { Auth } from "host/src/services/auth";
import { contract } from "./contract";
import type { PluginsClient } from "./plugins-client.gen";

export interface AuthContext {
  userId: string;
  user: {
    id: string;
    role?: string;
    email?: string;
    name?: string;
  };
  nearAccountId?: string;
  organizationId?: string;
  organizationRole?: string;
  reqHeaders?: Headers;
  auth: Auth;
}

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({
    demoMessage: z.string().optional(),
  }),

  secrets: z.object({
    API_DATABASE_URL: z.string().default("file:./api.db"),
    API_DATABASE_AUTH_TOKEN: z.string().optional(),
  }),

  context: z.object({
    userId: z.string().optional(),
    user: z
      .object({
        id: z.string(),
        role: z.string().optional(),
        email: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
    nearAccountId: z.string().optional(),
    nearAccounts: z
      .array(
        z.object({
          accountId: z.string(),
          network: z.string(),
          isPrimary: z.boolean(),
        }),
      )
      .optional(),
    organizationId: z.string().optional(),
    organizationRole: z.string().optional(),
    reqHeaders: z.custom<Headers>().optional(),
    getRawBody: z.custom<() => Promise<string>>().optional(),
    auth: z.custom<Auth>().optional(),
  }),

  contract,

  initialize: (config, plugins) =>
    Effect.sync(() => {
      console.log("[API] Services Initialized");
      console.log("[API] Plugins available:", Object.keys(plugins).join(", ") || "none");
      console.log("[API] demoMessage:", config.variables.demoMessage ?? "(not configured)");
      return { plugins, demoMessage: config.variables.demoMessage ?? "not configured" };
    }),

  shutdown: () => Effect.log("[API] Shutdown"),

  createRouter: (services, builder) => {
    const requireAuth = builder.middleware(async ({ context, next }) => {
      if (!context.user || !context.userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: {
            authType: "session",
            hint: "Sign in with NEAR, passkey, email, phone, or anonymous",
          },
        });
      }
      return next({
        context: {
          userId: context.userId,
          user: context.user,
          nearAccountId: context.nearAccountId,
          organizationId: context.organizationId,
          organizationRole: context.organizationRole,
          reqHeaders: context.reqHeaders,
          auth: context.auth!,
        } as AuthContext,
      });
    });

    return {
      ping: builder.ping.handler(async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      })),

      reloadConfig: builder.reloadConfig.handler(async () => ({
        status: "pending" as const,
        note: "restart host to pick up new config",
      })),

      authHealth: builder.authHealth.use(requireAuth).handler(async () => ({
        status: "ok",
        emailConfigured: !!process.env.EMAIL_PROVIDER,
        smsConfigured: !!process.env.SMS_PROVIDER,
      })),

      publicError: builder.publicError.handler(() => {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Test UNAUTHORIZED error - thrown directly from handler",
          data: {
            provider: "test-provider",
            action: "test-action",
            timestamp: new Date().toISOString(),
          },
        });
      }),

      protectedError: builder.protectedError.use(requireAuth).handler(() => {
        throw new ORPCError("NOT_FOUND", {
          message: "Test NOT_FOUND error - thrown after auth middleware",
          data: {
            resource: "test-resource",
            resourceId: "test-id-123",
            timestamp: new Date().toISOString(),
          },
        });
      }),

      pluginDemo: builder.pluginDemo.handler(async () => {
        const createRegistryClient = services.plugins.registry;
        const registryStatus = createRegistryClient
          ? await createRegistryClient().getRegistryStatus()
          : {
              discoveredApps: 0,
              metadataContractId: "",
              metadataFastKvUrl: "https://unavailable",
              relayEnabled: false,
              relayAccountId: null,
              timestamp: new Date().toISOString(),
            };

        return {
          apiVariable: services.demoMessage,
          registryStatus,
          availablePlugins: Object.keys(services.plugins),
        };
      }),
    };
  },
});
