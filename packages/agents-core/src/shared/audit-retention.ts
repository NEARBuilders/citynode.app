import { sql } from "drizzle-orm";
import { getDatabase } from "../lib/db.js";

const auditRetentionDays = 90;
const sweepLimit = 500;

/** Preserve live authorization evidence, unsettled effects and explicit holds. */
export async function sweepOldAuditEvents(): Promise<number> {
  const removed = await getDatabase().execute<{ id: number }>(sql`
    WITH candidates AS (
      SELECT e.id
      FROM audit_events e
      WHERE e.created_at < now() - ${auditRetentionDays} * interval '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM audit_retention_holds h
          WHERE h.tenant_id = e.tenant_id
            AND h.released_at IS NULL
            AND (h.agent_id IS NULL OR h.agent_id = e.agent_id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM operation_artifacts a
          WHERE a.tenant_id = e.tenant_id AND a.agent_id = e.agent_id
            AND (a.operation_id = e.resource_id OR a.grant_id = e.grant_id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM operations o
          WHERE o.tenant_id = e.tenant_id AND o.agent_id = e.agent_id
            AND o.id = e.resource_id
            AND o.status IN ('pending', 'uncertain')
        )
      ORDER BY e.id
      LIMIT ${sweepLimit}
      FOR UPDATE OF e SKIP LOCKED
    )
    DELETE FROM audit_events e USING candidates c WHERE e.id = c.id RETURNING e.id
  `);
  return removed.rows.length;
}
