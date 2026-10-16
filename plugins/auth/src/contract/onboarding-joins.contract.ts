import "@orpc/openapi/extensions/route";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { Errors } from "./errors";

const onboardingRedemptionMonthSchema = z.object({
  month: z.string(),
  redeemed: z.number().int().nonnegative(),
  newMembers: z.number().int().nonnegative(),
});

export const onboardingJoinRoutes = {
  listOnboardingJoins: oc
    .route({ method: "GET", path: "/v1/auth/admin/onboarding/joins" })
    .input(
      z.object({
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
      }),
    )
    .output(
      z.object({
        month: z.string(),
        totals: z.object({
          redeemed: z.number().int().nonnegative(),
          newMembers: z.number().int().nonnegative(),
        }),
        organizations: z.array(
          z.object({
            organizationId: z.string(),
            redeemed: z.number().int().nonnegative(),
            newMembers: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .errors(Errors),

  getOnboardingRedemptions: oc
    .route({ method: "GET", path: "/v1/auth/onboarding/redemptions" })
    .input(z.object({ organizationId: z.string().optional() }))
    .output(
      z.object({
        thisMonth: onboardingRedemptionMonthSchema,
        lastMonth: onboardingRedemptionMonthSchema,
      }),
    )
    .errors(Errors),
};
