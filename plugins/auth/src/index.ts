import { and, eq } from "drizzle-orm";
import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { type Auth, createAuthInstance } from "./auth-instance";
import { contract } from "./contract";
import { type AuthDatabase, createAuthDatabase } from "./db/layer";
import * as schema from "./db/schema";

interface AuthServices {
  auth: Auth;
  db: AuthDatabase;
  handler: (req: Request) => Promise<Response>;
}

export default createPlugin({
  variables: z.object({
    account: z.string(),
    hostUrl: z.string(),
    uiUrl: z.string().optional(),
    githubClientId: z.string().optional(),
    githubClientSecret: z.string().optional(),
  }),

  secrets: z.object({
    AUTH_DATABASE_URL: z.string().default("file:./auth.db"),
    AUTH_DATABASE_AUTH_TOKEN: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().optional(),
  }),

  context: z.object({
    reqHeaders: z.record(z.string()).optional(),
  }),

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const { db } = createAuthDatabase(
        config.secrets.AUTH_DATABASE_URL,
        config.secrets.AUTH_DATABASE_AUTH_TOKEN,
      );

      const auth = createAuthInstance(
        {
          account: config.variables.account,
          hostUrl: config.variables.hostUrl,
          uiUrl: config.variables.uiUrl,
          githubClientId: config.variables.githubClientId,
          githubClientSecret: config.variables.githubClientSecret,
        },
        db,
      );

      console.log("[Auth] Better Auth instance created");

      return {
        auth,
        db,
        handler: (req: Request) => auth.handler(req),
      } satisfies AuthServices;
    }),

  shutdown: () =>
    Effect.sync(() => {
      console.log("[Auth] Shutdown");
    }),

  createRouter: (services, builder) => {
    const requireAuth = builder.middleware(async ({ context, next }) => {
      const headers = new Headers(Object.entries(context.reqHeaders ?? {}) as [string, string][]);
      const session = await services.auth.api.getSession({ headers });

      if (!session?.user) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Authentication required",
        });
      }

      return next({
        context: {
          userId: session.user.id,
          user: session.user,
          reqHeaders: context.reqHeaders,
        },
      });
    });

    return {
      getSession: builder.getSession.handler(async ({ context }) => {
        const headers = new Headers(Object.entries(context.reqHeaders ?? {}) as [string, string][]);
        const session = await services.auth.api.getSession({ headers });
        return {
          session: session?.session ?? null,
          user: session?.user ?? null,
        };
      }),

      getContext: builder.getContext.handler(async ({ context }) => {
        const headers = new Headers(Object.entries(context.reqHeaders ?? {}) as [string, string][]);
        const session = await services.auth.api.getSession({ headers });
        const user = session?.user ?? null;

        const isAuthenticated = !!user;
        const authMethod = isAuthenticated ? ("session" as const) : ("none" as const);

        let nearCapabilities = {
          primaryAccountId: null as string | null,
          linkedAccounts: [] as Array<{
            accountId: string;
            network: string;
            publicKey: string;
            isPrimary: boolean;
          }>,
          hasNearAccount: false,
        };

        if (user?.id) {
          const nearAccounts = await services.db.query.nearAccount.findMany({
            where: eq(schema.nearAccount.userId, user.id),
          });

          if (nearAccounts.length > 0) {
            const linkedAccounts = nearAccounts.map((acc) => ({
              accountId: acc.accountId,
              network: acc.network,
              publicKey: acc.publicKey,
              isPrimary: acc.isPrimary ?? false,
            }));

            const primary = nearAccounts.find((acc) => acc.isPrimary) ?? nearAccounts[0];

            nearCapabilities = {
              primaryAccountId: primary?.accountId ?? null,
              linkedAccounts,
              hasNearAccount: true,
            };
          }
        }

        let organizationContext = {
          activeOrganizationId: null as string | null,
          organization: null as {
            id: string;
            name: string;
            slug: string;
            logo: string | null | undefined;
            metadata?: Record<string, unknown>;
          } | null,
          member: null as { id: string; role: string } | null,
          isPersonal: false,
          hasOrganization: false,
        };

        const organizations: Array<{ id: string; role: string; name?: string; slug?: string }> = [];

        if (user?.id) {
          const memberships = await services.db.query.member.findMany({
            where: eq(schema.member.userId, user.id),
          });

          for (const m of memberships) {
            const org = await services.db.query.organization.findFirst({
              where: eq(schema.organization.id, m.organizationId),
            });
            if (org) {
              organizations.push({
                id: org.id,
                role: m.role,
                name: org.name,
                slug: org.slug,
              });
            }
          }

          const activeOrgId = session?.session?.activeOrganizationId;

          if (activeOrgId) {
            const org = await services.db.query.organization.findFirst({
              where: eq(schema.organization.id, activeOrgId),
            });

            if (org) {
              const membership = await services.db.query.member.findFirst({
                where: and(
                  eq(schema.member.userId, user.id),
                  eq(schema.member.organizationId, activeOrgId),
                ),
              });

              if (membership) {
                organizationContext = {
                  activeOrganizationId: activeOrgId,
                  organization: {
                    id: org.id,
                    name: org.name,
                    slug: org.slug,
                    logo: org.logo,
                    metadata: org.metadata ? JSON.parse(org.metadata) : undefined,
                  },
                  member: {
                    id: membership.id,
                    role: membership.role,
                  },
                  isPersonal: org.slug === user.id,
                  hasOrganization: true,
                };
              }
            }
          }
        }

        return {
          user: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image ?? null,
                role: user.role ?? null,
                isAnonymous: (user as any).isAnonymous ?? null,
              }
            : null,
          userId: user?.id ?? null,
          isAuthenticated,
          authMethod,
          near: nearCapabilities,
          organization: organizationContext,
          organizations: organizations.length > 0 ? organizations : undefined,
        };
      }),

      getActiveMember: builder.getActiveMember
        .use(requireAuth)
        .handler(async ({ context, input }) => {
          const headers = new Headers(
            Object.entries(context.reqHeaders ?? {}) as [string, string][],
          );
          const member = await services.auth.api.getActiveMember({
            headers,
            query: input?.organizationId ? { organizationId: input.organizationId } : undefined,
          });

          if (!member) {
            return { id: null, role: null, organizationId: null };
          }

          return {
            id: member.id,
            role: member.role,
            organizationId: "organizationId" in member ? (member as any).organizationId : null,
          };
        }),

      listApiKeys: builder.listApiKeys.use(requireAuth).handler(async ({ context, input }) => {
        const result = await services.auth.api.listApiKeys({
          headers: new Headers(Object.entries(context.reqHeaders ?? {}) as [string, string][]),
          query: input?.organizationId ? { organizationId: input.organizationId } : undefined,
        });
        return (result as any[]) ?? [];
      }),

      createApiKey: builder.createApiKey.use(requireAuth).handler(async ({ input, context }) => {
        const { ...apiKeyInput } = input;
        const result = await services.auth.api.createApiKey({
          headers: new Headers(Object.entries(context.reqHeaders ?? {}) as [string, string][]),
          ...apiKeyInput,
        });
        return result as any;
      }),

      deleteApiKey: builder.deleteApiKey.use(requireAuth).handler(async ({ input, context }) => {
        try {
          await services.auth.api.deleteApiKey({
            headers: new Headers(Object.entries(context.reqHeaders ?? {}) as [string, string][]),
            id: input.id,
          });
          return { success: true };
        } catch {
          throw new ORPCError("NOT_FOUND", { message: "API key not found" });
        }
      }),

      listMembers: builder.listMembers.use(requireAuth).handler(async ({ input }) => {
        return await services.db.query.member.findMany({
          where: eq(schema.member.organizationId, input.organizationId),
        });
      }),

      listInvitations: builder.listInvitations.use(requireAuth).handler(async ({ input }) => {
        return await services.db.query.invitation.findMany({
          where: eq(schema.invitation.organizationId, input.organizationId),
        });
      }),

      cancelInvitation: builder.cancelInvitation.use(requireAuth).handler(async ({ input }) => {
        const invitation = await services.db.query.invitation.findFirst({
          where: eq(schema.invitation.id, input.id),
        });

        if (!invitation) {
          throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
        }

        await services.db.delete(schema.invitation).where(eq(schema.invitation.id, input.id));
        return { success: true };
      }),

      resendInvitation: builder.resendInvitation
        .use(requireAuth)
        .handler(async ({ input, context }) => {
          const invitation = await services.db.query.invitation.findFirst({
            where: eq(schema.invitation.id, input.id),
          });

          if (!invitation) {
            throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
          }

          const headers = new Headers(
            Object.entries(context.reqHeaders ?? {}) as [string, string][],
          );
          await services.auth.api.cancelInvitation({
            headers,
            body: { invitationId: input.id },
          });

          const org = await services.db.query.organization.findFirst({
            where: eq(schema.organization.id, invitation.organizationId),
          });

          if (org) {
            await services.auth.api.inviteMember({
              headers,
              body: {
                organizationId: invitation.organizationId,
                email: invitation.email,
                role: invitation.role ?? "member",
              },
            });
          }

          return { sent: true };
        }),
    };
  },
});
