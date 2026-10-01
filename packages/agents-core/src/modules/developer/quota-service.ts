import {
  type PartnerQuotaProfile,
  type PartnerQuotaView,
  partnerQuotaProfileSchema,
} from "@near-intents-agent-api/contracts";
import {
  agents,
  quotaChanges,
  requestBuckets,
  sponsorReservations,
  type Tx,
  tenants,
} from "@near-intents-agent-api/database";
import { and, count, eq, gte, inArray, isNull } from "drizzle-orm";
import { getRuntime } from "../../config/runtime.js";
import { databaseClock, getDatabase } from "../../lib/db.js";
import { newId } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";

export function effectiveQuota(profile: PartnerQuotaProfile) {
  const runtime = getRuntime();
  return {
    liveAgents: profile.liveAgents ?? runtime.maxAgentsPerTenant ?? 50,
    lifetimeAgents: profile.lifetimeAgents ?? runtime.maxCreatedAgentsPerTenant ?? null,
    requestsPerMinute: profile.requestsPerMinute ?? runtime.tenantRequestsPerMinute ?? 600,
    keyRequestsPerMinute: profile.keyRequestsPerMinute ?? runtime.keyRequestsPerMinute ?? 120,
    sponsorDaily: profile.sponsorDaily ?? runtime.sponsorDailyTenantLimit,
    sponsorDailyPerAgent: profile.sponsorDailyPerAgent ?? runtime.sponsorDailyAgentLimit,
    sponsorDailyGlobal: runtime.sponsorDailyGlobalLimit,
  };
}

export async function readPartnerQuota(tenantId: string, tx?: Tx): Promise<PartnerQuotaView> {
  if (!tx)
    return getDatabase().transaction((snapshot) => readPartnerQuota(tenantId, snapshot), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new ApiError("tenant_not_found", 404);
  const now = await databaseClock(tx);
  const [all] = await tx.select({ n: count() }).from(agents).where(eq(agents.tenantId, tenantId));
  const [live] = await tx
    .select({ n: count() })
    .from(agents)
    .where(
      and(
        eq(agents.tenantId, tenantId),
        inArray(agents.lifecycle, ["pending", "active", "archived"]),
      ),
    );
  const [requests] = await tx
    .select()
    .from(requestBuckets)
    .where(
      and(
        eq(requestBuckets.key, `tenant:${tenantId}`),
        gte(requestBuckets.windowStart, new Date(Math.floor(now.getTime() / 60_000) * 60_000)),
      ),
    );
  const [sponsor] = await tx
    .select({ n: count() })
    .from(sponsorReservations)
    .where(
      and(
        eq(sponsorReservations.tenantId, tenantId),
        isNull(sponsorReservations.releasedAt),
        gte(sponsorReservations.createdAt, new Date(now.getTime() - 86_400_000)),
      ),
    );
  return {
    revision: tenant.quotaRevision,
    overrides: tenant.quotaProfile,
    limits: effectiveQuota(tenant.quotaProfile),
    usage: {
      liveAgents: live?.n ?? 0,
      lifetimeAgents: all?.n ?? 0,
      requestsThisMinute: requests?.count ?? 0,
      sponsorLast24Hours: sponsor?.n ?? 0,
    },
    observedAt: now.toISOString(),
  };
}

/** Operator CLI only. The DB credential is the administrative authority; no partner mutation route. */
export async function setPartnerQuota(input: {
  tenantId: string;
  expectedRevision: number;
  profile: PartnerQuotaProfile;
  operator: string;
  reason: string;
}) {
  const profile = partnerQuotaProfileSchema.parse(input.profile);
  if (!input.operator.trim() || !input.reason.trim())
    throw new ApiError("quota_audit_required", 400);
  return getDatabase().transaction(async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("update");
    if (!tenant) throw new ApiError("tenant_not_found", 404);
    if (tenant.quotaRevision !== input.expectedRevision)
      throw new ApiError("quota_revision_conflict", 409);
    await tx
      .update(tenants)
      .set({ quotaProfile: profile, quotaRevision: tenant.quotaRevision + 1 })
      .where(eq(tenants.id, input.tenantId));
    await tx.insert(quotaChanges).values({
      id: newId(),
      tenantId: input.tenantId,
      revision: tenant.quotaRevision + 1,
      operator: input.operator,
      reason: input.reason,
      previous: tenant.quotaProfile,
      profile,
    });
    return { revision: tenant.quotaRevision + 1, profile };
  });
}
