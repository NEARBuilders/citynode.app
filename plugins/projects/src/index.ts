import { createPlugin } from "every-plugin";
import { Cause, Effect, Exit, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { contract } from "./contract";
import { DatabaseLive } from "./db/layer";
import { KvService, KvServiceLive } from "./services/kv";
import { ProjectService, ProjectServiceLive } from "./services/projects";

type Auth = any;

interface AuthContext {
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

export default createPlugin({
  variables: z.object({}),

  secrets: z.object({
    PROJECTS_DATABASE_URL: z.string().default("file:./projects.db"),
    PROJECTS_DATABASE_AUTH_TOKEN: z.string().optional(),
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

  initialize: (config) =>
    Effect.gen(function* () {
      const Database = DatabaseLive(
        config.secrets.PROJECTS_DATABASE_URL,
        config.secrets.PROJECTS_DATABASE_AUTH_TOKEN,
      );

      const KvServices = KvServiceLive.pipe(Layer.provide(Database));
      const ProjectServices = ProjectServiceLive.pipe(Layer.provide(Database));

      const AllServices = Layer.merge(KvServices, ProjectServices);

      const [kv, project] = yield* Effect.provide(
        Effect.all([KvService, ProjectService]),
        AllServices,
      );

      console.log("[Projects] Services Initialized");
      return { kv, project };
    }),

  shutdown: () => Effect.log("[Projects] Shutdown"),

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

    const requireNearAccount = builder.middleware(async ({ context, next }) => {
      if (!context.user || !context.userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
          data: { authType: "session" },
        });
      }

      if (!context.nearAccountId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "NEAR wallet required",
          data: {
            authType: "near",
            hint: "Link a NEAR wallet to perform this action",
          },
        });
      }

      return next({
        context: {
          userId: context.userId,
          user: context.user,
          nearAccountId: context.nearAccountId,
          reqHeaders: context.reqHeaders,
          auth: context.auth!,
        } as AuthContext,
      });
    });

    const requireOrgRole = (requiredRole: "owner" | "admin" | "member") =>
      builder.middleware(async ({ context, next }, input: any) => {
        if (!context.user || !context.userId) {
          throw new ORPCError("UNAUTHORIZED", {
            message: "Authentication required",
            data: { authType: "session" },
          });
        }

        const targetOrgId = input?.organizationId || context.organizationId;

        if (!targetOrgId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Organization ID required",
            data: {},
          });
        }

        let member: any;
        try {
          const result = await context.auth!.api.getActiveMember({
            headers: context.reqHeaders!,
            query: { organizationId: targetOrgId },
          });
          member = result;
        } catch {
          throw new ORPCError("FORBIDDEN", {
            message: "You are not a member of this organization",
            data: {},
          });
        }

        if (!member) {
          throw new ORPCError("FORBIDDEN", {
            message: "You are not a member of this organization",
            data: {},
          });
        }

        const userRole = member.role as string;

        const roleHierarchy: Record<string, number> = {
          owner: 100,
          admin: 80,
          member: 50,
        };

        const userRoleLevel = roleHierarchy[userRole] ?? 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] ?? 0;

        if (userRoleLevel < requiredRoleLevel) {
          throw new ORPCError("FORBIDDEN", {
            message: `Requires ${requiredRole} role in organization`,
            data: {
              requiredRole,
              currentRole: userRole,
            },
          });
        }

        return next({
          context: {
            userId: context.userId,
            user: context.user,
            nearAccountId: context.nearAccountId,
            organizationId: targetOrgId,
            organizationRole: userRole,
            reqHeaders: context.reqHeaders,
            auth: context.auth!,
          } as AuthContext,
        });
      });

    return {
      // KV endpoints
      listKeys: builder.listKeys.use(requireAuth).handler(async ({ input, context }) => {
        const exit = await Effect.runPromiseExit(
          services.kv.listKeys(context.userId, input.limit, input.offset),
        );

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
            data: {
              originalError: squashed instanceof Error ? squashed.message : String(squashed),
            },
          });
        }

        return exit.value;
      }),

      getValue: builder.getValue.use(requireAuth).handler(async ({ input, context, errors }) => {
        const exit = await Effect.runPromiseExit(services.kv.getValue(input.key, context.userId));

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            if (squashed.code === "NOT_FOUND") {
              throw errors.NOT_FOUND({
                message: "Key not found",
                data: { resource: "kv", resourceId: input.key },
              });
            }
            if (squashed.code === "FORBIDDEN") {
              throw errors.FORBIDDEN({
                message: "Access denied",
                data: { action: "read" },
              });
            }
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
            data: {
              originalError: squashed instanceof Error ? squashed.message : String(squashed),
            },
          });
        }

        return exit.value;
      }),

      setValue: builder.setValue.use(requireAuth).handler(async ({ input, context, errors }) => {
        const exit = await Effect.runPromiseExit(
          services.kv.setValue(input.key, input.value, context.userId),
        );

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            if (squashed.code === "FORBIDDEN") {
              throw errors.FORBIDDEN({
                message: "Access denied",
                data: { action: "write" },
              });
            }
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
            data: {
              originalError: squashed instanceof Error ? squashed.message : String(squashed),
            },
          });
        }

        return exit.value;
      }),

      deleteKey: builder.deleteKey.use(requireAuth).handler(async ({ input, context, errors }) => {
        const exit = await Effect.runPromiseExit(services.kv.deleteKey(input.key, context.userId));

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            if (squashed.code === "NOT_FOUND") {
              throw errors.NOT_FOUND({
                message: "Key not found",
                data: { resource: "kv", resourceId: input.key },
              });
            }
            if (squashed.code === "FORBIDDEN") {
              throw errors.FORBIDDEN({
                message: "Access denied",
                data: { action: "delete" },
              });
            }
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
            data: {
              originalError: squashed instanceof Error ? squashed.message : String(squashed),
            },
          });
        }

        return exit.value;
      }),

      // Projects
      listProjects: builder.listProjects.handler(async ({ input }) => {
        const exit = await Effect.runPromiseExit(services.project.listProjects(input));

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
          });
        }

        return exit.value;
      }),

      getProject: builder.getProject.handler(async ({ input, errors }) => {
        const exit = await Effect.runPromiseExit(services.project.getProject(input.id));

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
          });
        }

        if (!exit.value) {
          throw errors.NOT_FOUND({
            message: "Project not found",
            data: { resource: "project", resourceId: input.id },
          });
        }

        return { data: exit.value };
      }),

      createProject: builder.createProject.use(requireAuth).handler(async ({ input, context }) => {
        const exit = await Effect.runPromiseExit(
          services.project.createProject(input, context.userId),
        );

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
          });
        }

        return exit.value;
      }),

      updateProject: builder.updateProject
        .use(requireAuth)
        .handler(async ({ input, context, errors }) => {
          const exit = await Effect.runPromiseExit(
            services.project.updateProject(input.id, input, context.userId),
          );

          if (Exit.isFailure(exit)) {
            const squashed = Cause.squash(exit.cause);
            if (squashed instanceof ORPCError) {
              if (squashed.code === "NOT_FOUND") {
                throw errors.NOT_FOUND({
                  message: "Project not found",
                  data: { resource: "project", resourceId: input.id },
                });
              }
              throw squashed;
            }
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: squashed instanceof Error ? squashed.message : String(squashed),
            });
          }

          return exit.value;
        }),

      deleteProject: builder.deleteProject
        .use(requireAuth)
        .handler(async ({ input, context, errors }) => {
          const exit = await Effect.runPromiseExit(
            services.project.deleteProject(input.id, context.userId),
          );

          if (Exit.isFailure(exit)) {
            const squashed = Cause.squash(exit.cause);
            if (squashed instanceof ORPCError) {
              if (squashed.code === "NOT_FOUND") {
                throw errors.NOT_FOUND({
                  message: "Project not found",
                  data: { resource: "project", resourceId: input.id },
                });
              }
              throw squashed;
            }
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: squashed instanceof Error ? squashed.message : String(squashed),
            });
          }

          return exit.value;
        }),

      listProjectApps: builder.listProjectApps.handler(async ({ input }) => {
        const exit = await Effect.runPromiseExit(services.project.listProjectApps(input.projectId));

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
          });
        }

        return { data: exit.value };
      }),

      linkAppToProject: builder.linkAppToProject
        .use(requireAuth)
        .handler(async ({ input, context, errors }) => {
          const exit = await Effect.runPromiseExit(
            services.project.linkAppToProject(
              input.projectId,
              input.accountId,
              input.gatewayId,
              context.userId,
            ),
          );

          if (Exit.isFailure(exit)) {
            const squashed = Cause.squash(exit.cause);
            if (squashed instanceof ORPCError) {
              if (squashed.code === "NOT_FOUND") {
                throw errors.NOT_FOUND({
                  message: "Project not found",
                  data: { resource: "project", resourceId: input.projectId },
                });
              }
              throw squashed;
            }
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: squashed instanceof Error ? squashed.message : String(squashed),
            });
          }

          return exit.value;
        }),

      unlinkAppFromProject: builder.unlinkAppFromProject
        .use(requireAuth)
        .handler(async ({ input, context, errors }) => {
          const exit = await Effect.runPromiseExit(
            services.project.unlinkAppFromProject(
              input.projectId,
              input.accountId,
              input.gatewayId,
              context.userId,
            ),
          );

          if (Exit.isFailure(exit)) {
            const squashed = Cause.squash(exit.cause);
            if (squashed instanceof ORPCError) {
              if (squashed.code === "NOT_FOUND") {
                throw errors.NOT_FOUND({
                  message: "Project or app not found",
                  data: { resource: "project-app" },
                });
              }
              throw squashed;
            }
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: squashed instanceof Error ? squashed.message : String(squashed),
            });
          }

          return exit.value;
        }),

      listProjectsForApp: builder.listProjectsForApp.handler(async ({ input }) => {
        const exit = await Effect.runPromiseExit(
          services.project.listProjectsForApp(input.accountId, input.gatewayId),
        );

        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          if (squashed instanceof ORPCError) {
            throw squashed;
          }
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: squashed instanceof Error ? squashed.message : String(squashed),
          });
        }

        return { data: exit.value };
      }),

      // API Keys
      listApiKeys: builder.listApiKeys.use(requireAuth).handler(async ({ context, input }) => {
        const result = await context.auth.api.listApiKeys({
          query: {
            organizationId: input.organizationId,
          },
          headers: context.reqHeaders!,
        });

        if (!result) {
          return { keys: [] };
        }

        return {
          keys: (Array.isArray(result) ? result : result.keys || []).map((key: any) => ({
            id: key.id,
            name: key.name || "Unnamed",
            prefix: key.prefix || "api_",
            permissions: key.permissions ? JSON.parse(key.permissions) : [],
            lastUsed: key.lastRequest ? new Date(key.lastRequest).toISOString() : null,
            createdAt: new Date(key.createdAt).toISOString(),
            expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
          })),
        };
      }),

      createApiKey: builder.createApiKey
        .use(requireAuth)
        .handler(async ({ context, input, errors }) => {
          try {
            const result = await context.auth.api.createApiKey({
              body: {
                name: input.name,
                organizationId: input.organizationId,
                expiresIn: input.expiresInDays ? input.expiresInDays * 24 * 60 * 60 : undefined,
                permissions: input.permissions ? JSON.stringify(input.permissions) : undefined,
              },
              headers: context.reqHeaders!,
            });

            if (!result) {
              throw errors.BAD_REQUEST({
                message: "Failed to create API key",
                data: {},
              });
            }

            return {
              id: result.id,
              name: result.name || input.name,
              key: result.key || result.start || "",
              prefix: result.prefix || "api_",
              permissions: input.permissions || ["read"],
              createdAt: new Date(result.createdAt).toISOString(),
              expiresAt: result.expiresAt ? new Date(result.expiresAt).toISOString() : null,
            };
          } catch (error) {
            throw errors.BAD_REQUEST({
              message: error instanceof Error ? error.message : "Failed to create API key",
              data: {},
            });
          }
        }),

      deleteApiKey: builder.deleteApiKey
        .use(requireAuth)
        .handler(async ({ context, input, errors }) => {
          try {
            await context.auth.api.deleteApiKey({
              body: {
                id: input.keyId,
              },
              headers: context.reqHeaders!,
            });

            return { deleted: true };
          } catch (error) {
            throw errors.NOT_FOUND({
              message: error instanceof Error ? error.message : "API key not found",
              data: {},
            });
          }
        }),

      // Organization Members
      listOrgMembers: builder.listOrgMembers
        .use(requireOrgRole("member"))
        .handler(async ({ context, input }) => {
          const result = await context.auth.api.listMembers({
            query: { organizationId: input.organizationId },
            headers: context.reqHeaders!,
          });

          const members = Array.isArray(result) ? result : (result?.members ?? []);

          return {
            members: members.map((m: any) => ({
              id: m.id,
              userId: m.userId,
              role: m.role as "owner" | "admin" | "member",
              name: m.user?.name || null,
              email: m.user?.email || null,
              createdAt: new Date(m.createdAt).toISOString(),
            })),
          };
        }),

      // Organization Invitations
      listOrgInvitations: builder.listOrgInvitations
        .use(requireOrgRole("member"))
        .handler(async ({ context, input }) => {
          const result = await context.auth.api.listInvitations({
            query: { organizationId: input.organizationId },
            headers: context.reqHeaders!,
          });

          const invitations = Array.isArray(result) ? result : [];

          return {
            invitations: invitations.map((inv: any) => ({
              id: inv.id,
              email: inv.email,
              role: inv.role as "admin" | "member",
              status: inv.status as "pending" | "accepted" | "rejected" | "expired",
              expiresAt: new Date(inv.expiresAt).toISOString(),
              createdAt: new Date(inv.createdAt).toISOString(),
            })),
          };
        }),

      cancelInvitation: builder.cancelInvitation
        .use(requireOrgRole("admin"))
        .handler(async ({ context, input, errors }) => {
          try {
            await context.auth.api.cancelInvitation({
              body: { invitationId: input.invitationId },
              headers: context.reqHeaders!,
            });

            return { cancelled: true };
          } catch (error) {
            throw errors.NOT_FOUND({
              message: error instanceof Error ? error.message : "Invitation not found",
              data: {},
            });
          }
        }),

      resendInvitation: builder.resendInvitation
        .use(requireOrgRole("admin"))
        .handler(async ({ context, input, errors }) => {
          try {
            await context.auth.api.cancelInvitation({
              body: { invitationId: input.invitationId },
              headers: context.reqHeaders!,
            });
          } catch {
            throw errors.NOT_FOUND({
              message: "Invitation not found",
              data: {},
            });
          }

          return { sent: true };
        }),
    };
  },
});
