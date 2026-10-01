import { z } from "zod";

const limit = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Operator-managed resource limits, independent of the owner's spending budget. */
export const partnerQuotaProfileSchema = z.strictObject({
  liveAgents: limit.optional(),
  lifetimeAgents: limit.optional(),
  requestsPerMinute: limit.optional(),
  keyRequestsPerMinute: limit.optional(),
  sponsorDaily: limit.optional(),
  sponsorDailyPerAgent: limit.optional(),
});
export type PartnerQuotaProfile = z.infer<typeof partnerQuotaProfileSchema>;
export const partnerQuotaViewSchema = z.strictObject({
  revision: limit,
  overrides: partnerQuotaProfileSchema,
  limits: z.strictObject({
    liveAgents: limit,
    lifetimeAgents: limit.nullable(),
    requestsPerMinute: limit,
    keyRequestsPerMinute: limit,
    sponsorDaily: limit,
    sponsorDailyPerAgent: limit,
    sponsorDailyGlobal: limit,
  }),
  usage: z.strictObject({
    liveAgents: limit,
    lifetimeAgents: limit,
    requestsThisMinute: limit,
    sponsorLast24Hours: limit,
  }),
  observedAt: z.iso.datetime(),
});
export type PartnerQuotaView = z.infer<typeof partnerQuotaViewSchema>;
