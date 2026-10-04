import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { Database } from "./db";
import * as schema from "./db/schema";
import { provisionDefaultTeams } from "./default-teams";

export function organizationApproval(db: Database) {
  return {
    id: "organization-approval",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/organization/create",
          handler: createAuthMiddleware(async (ctx) => {
            // Better Auth otherwise activates the new pending request automatically.
            return {
              context: { body: { ...ctx.body, keepCurrentActiveOrganization: true } },
            };
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/organization/set-active",
          handler: createAuthMiddleware(async (ctx) => {
            const { organizationId, organizationSlug } = ctx.body ?? {};
            if (!organizationId && !organizationSlug) return;
            const organization = await db.query.organization.findFirst({
              where: organizationId
                ? eq(schema.organization.id, organizationId)
                : eq(schema.organization.slug, organizationSlug),
            });
            if (organization && organization.status !== "active") {
              throw new APIError("FORBIDDEN", {
                message: "Organization requires platform-admin approval",
              });
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/organization/set-active",
          handler: createAuthMiddleware(async (ctx) => {
            const organization = ctx.context.returned;
            if (
              organization &&
              typeof organization === "object" &&
              "id" in organization &&
              typeof organization.id === "string"
            ) {
              const organizationId = organization.id;
              await db.transaction((tx) => provisionDefaultTeams(tx, organizationId));
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
