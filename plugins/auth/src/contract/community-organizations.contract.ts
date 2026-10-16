import "@orpc/openapi/extensions/route";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { Errors } from "./errors";
import { organizationInfoSchema } from "./schemas";

export const communityOrganizationRoutes = {
  provisionCommunityOrganization: oc
    .route({ method: "POST", path: "/v1/auth/admin/community-organizations" })
    .input(
      z.object({
        proposalId: z.string().min(1),
        name: z.string().trim().min(1),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        proposerAccountId: z.string().min(1),
        proposerUserId: z.string().optional(),
        legacyOrgId: z.string().optional(),
      }),
    )
    .output(organizationInfoSchema)
    .errors(Errors),

  releaseCommunityOrganization: oc
    .route({ method: "POST", path: "/v1/auth/admin/community-organizations/release" })
    .input(z.object({ proposalId: z.string().min(1) }))
    .output(
      z.object({
        released: z.boolean(),
        keptReason: z.enum(["not_found", "in_use"]).nullable(),
      }),
    )
    .errors(Errors),
};
