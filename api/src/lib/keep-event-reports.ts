import { and, eq, exists, sql } from "drizzle-orm";
import type { Database } from "../db";
import { discoveryActivities, eventReports } from "../db/schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function keepEventReports(
  tx: Tx,
  node: { id: string; tenantId: string | null },
): Promise<void> {
  await tx
    .update(eventReports)
    .set({ removedTenantId: node.tenantId })
    .where(eq(eventReports.nodeId, node.id));
  await tx
    .update(discoveryActivities)
    .set({
      ownerNodeId: null,
      data: sql`${discoveryActivities.data} || '{"ownerNodeId": null, "status": "draft"}'::jsonb`,
    })
    .where(
      and(
        eq(discoveryActivities.ownerNodeId, node.id),
        exists(
          tx
            .select({ reported: sql`1` })
            .from(eventReports)
            .where(eq(eventReports.activityId, discoveryActivities.id)),
        ),
      ),
    );
}
