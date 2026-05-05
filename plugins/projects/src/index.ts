import { createPlugin } from "every-plugin";
import { Cause, Effect, Exit, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { contract } from "./contract";
import { DatabaseLive } from "./db/layer";
import type { PluginsClient } from "./plugins-client.gen";
import { KvService, KvServiceLive } from "./services/kv";
import { ProjectService, ProjectServiceLive } from "./services/projects";

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
  reqHeaders?: Record<string, string>;
}

export default createPlugin.withPlugins<PluginsClient>()({
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
    organizationId: z.string().optional(),
    organizationRole: z.string().optional(),
    reqHeaders: z.record(z.string(), z.string()).optional(),
  }),

  contract,

  initialize: (_config, plugins) =>
    Effect.gen(function* () {
      const Database = DatabaseLive(
        _config.secrets.PROJECTS_DATABASE_URL,
        _config.secrets.PROJECTS_DATABASE_AUTH_TOKEN,
      );

      const KvServices = KvServiceLive.pipe(Layer.provide(Database));
      const ProjectServices = ProjectServiceLive.pipe(Layer.provide(Database));

      const AllServices = Layer.merge(KvServices, ProjectServices);

      const [kv, project] = yield* Effect.provide(
        Effect.all([KvService, ProjectService]),
        AllServices,
      );

      console.log("[Projects] Services Initialized");
      return { kv, project, plugins };
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
        } as AuthContext,
      });
    });

    const _requireNearAccount = builder.middleware(async ({ context, next }) => {
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
        } as AuthContext,
      });
    });

    const requireOrgRole = (requiredRole: "owner" | "admin" | "member") =>
      builder.middleware(async ({ context, next }, input: Record<string, unknown>) => {
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

        const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
        let member: { id: string | null; role: string | null; organizationId: string | null };
        try {
          member = await authClient.getActiveMember({ organizationId: targetOrgId as string });
        } catch {
          throw new ORPCError("FORBIDDEN", {
            message: "You are not a member of this organization",
            data: {},
          });
        }

        if (!member?.role) {
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
            organizationId: targetOrgId as string,
            organizationRole: userRole,
            reqHeaders: context.reqHeaders,
          } as AuthContext,
        });
      });

    return {
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

      listApiKeys: builder.listApiKeys.use(requireAuth).handler(async ({ context, input }) => {
        const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
        const result = await authClient.listApiKeys({
          organizationId: input.organizationId,
        });

        if (!result || result.length === 0) {
          return { keys: [] };
        }

        return {
          keys: result.map((key: any) => ({
            id: key.id,
            name: key.name || "Unnamed",
            prefix: key.prefix || "api_",
            permissions: key.permissions ? JSON.parse(key.permissions as string) : [],
            lastUsed: null,
            createdAt: new Date(key.createdAt).toISOString(),
            expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
          })),
        };
      }),

      createApiKey: builder.createApiKey
        .use(requireAuth)
        .handler(async ({ context, input, errors }) => {
          try {
            const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
            const result = await authClient.createApiKey({
              name: input.name,
              organizationId: input.organizationId,
              expiresAt: input.expiresInDays
                ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
                : undefined,
              permissions: input.permissions ? { default: input.permissions } : undefined,
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
              key: result.key || "",
              prefix: result.prefix || "api_",
              permissions: input.permissions || ["read"],
              createdAt: new Date(result.createdAt).toISOString(),
              expiresAt: result.expiresAt ? new Date(result.expiresAt).toISOString() : null,
            };
          } catch (error) {
            if (error instanceof ORPCError) throw error;
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
            const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
            await authClient.deleteApiKey({ id: input.keyId });

            return { deleted: true };
          } catch (error) {
            throw errors.NOT_FOUND({
              message: error instanceof Error ? error.message : "API key not found",
              data: {},
            });
          }
        }),

      listOrgMembers: builder.listOrgMembers
        .use(requireOrgRole("member"))
        .handler(async ({ context, input }) => {
          const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
          const members = await authClient.listMembers({
            organizationId: input.organizationId,
          });

          return {
            members: (members ?? []).map((m: any) => ({
              id: m.id,
              userId: m.userId,
              role: m.role as "owner" | "admin" | "member",
              name: null,
              email: null,
              createdAt: new Date(m.createdAt).toISOString(),
            })),
          };
        }),

      listOrgInvitations: builder.listOrgInvitations
        .use(requireOrgRole("member"))
        .handler(async ({ context, input }) => {
          const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
          const invitations = await authClient.listInvitations({
            organizationId: input.organizationId,
          });

          return {
            invitations: (invitations ?? []).map((inv: any) => ({
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
            const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
            await authClient.cancelInvitation({ id: input.invitationId });

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
            const authClient = services.plugins.auth({ reqHeaders: context.reqHeaders });
            await authClient.resendInvitation({ id: input.invitationId });
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
