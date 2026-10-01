import {
  agents,
  custodyWallets,
  operations,
  walletPolicies,
} from "@near-intents-agent-api/database";
import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";

export async function findManagedAgents(tenantId: string, after?: string) {
  const db = getDatabase();
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      externalUserId: agents.externalUserId,
      ownerAccountId: agents.ownerAccountId,
      walletStatus: custodyWallets.status,
      providerWalletId: custodyWallets.providerWalletId,
      policyStatus: sql<string | null>`(
        select ${walletPolicies.status} from ${walletPolicies}
        where ${walletPolicies.tenantId} = ${agents.tenantId}
          and ${walletPolicies.agentId} = ${agents.id}
          and ${walletPolicies.status} NOT IN ('draft', 'discarded')
        order by ${walletPolicies.version} desc limit 1
      )`,
    })
    .from(agents)
    .leftJoin(
      custodyWallets,
      and(eq(custodyWallets.tenantId, agents.tenantId), eq(custodyWallets.agentId, agents.id)),
    )
    .where(and(eq(agents.tenantId, tenantId), after ? gt(agents.id, after) : undefined))
    .orderBy(asc(agents.id))
    .limit(51);
  return rows;
}

export async function countManagedResources(tenantId: string) {
  const db = getDatabase();
  const [[agentCount], [operationCount]] = await Promise.all([
    db.select({ total: count() }).from(agents).where(eq(agents.tenantId, tenantId)),
    db
      .select({
        total: count(),
        pending: sql<number>`count(*) filter (where ${operations.status} = 'pending')`.mapWith(
          Number,
        ),
        uncertain: sql<number>`count(*) filter (where ${operations.status} = 'uncertain')`.mapWith(
          Number,
        ),
        settled:
          sql<number>`count(*) filter (where ${operations.kind} = 'execute' and ${operations.status} = 'completed')`.mapWith(
            Number,
          ),
      })
      .from(operations)
      .where(eq(operations.tenantId, tenantId)),
  ]);
  return {
    agents: agentCount?.total ?? 0,
    operations: operationCount?.total ?? 0,
    pending: operationCount?.pending ?? 0,
    uncertain: operationCount?.uncertain ?? 0,
    settled: operationCount?.settled ?? 0,
  };
}
