import { sql } from "drizzle-orm";
import { getDatabase } from "../lib/db.js";

const retentionDays = 90;
const batchSize = 500;

/** Retire finished timelock metadata before its terminal operation detail. */
export async function sweepTerminalDelayedExecutions(): Promise<number> {
  const removed = await getDatabase().execute<{ id: string }>(sql`
    WITH candidates AS (
      SELECT d.tenant_id, d.agent_id, d.id
      FROM delayed_executions d
      JOIN operations o ON o.tenant_id = d.tenant_id AND o.agent_id = d.agent_id AND o.id = d.id
      WHERE d.state IN ('finished', 'cancelled')
        AND o.status IN ('completed', 'failed')
        AND d.updated_at < now() - ${retentionDays} * interval '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM audit_retention_holds h
          WHERE h.tenant_id = d.tenant_id AND h.released_at IS NULL
            AND (h.agent_id IS NULL OR h.agent_id = d.agent_id)
        )
      ORDER BY d.updated_at
      LIMIT ${batchSize}
      FOR UPDATE OF d SKIP LOCKED
    )
    DELETE FROM delayed_executions d USING candidates c
    WHERE d.tenant_id = c.tenant_id AND d.agent_id = c.agent_id AND d.id = c.id
    RETURNING d.id
  `);
  return removed.rows.length;
}

/** Expired/revoked grant detail can go once no live work needs it. */
export async function sweepExpiredGrants(): Promise<number> {
  const removed = await getDatabase().execute<{ id: string }>(sql`
    WITH candidates AS (
      SELECT g.tenant_id, g.agent_id, g.id
      FROM agent_grants g
      WHERE GREATEST(g.expires_at, COALESCE(g.revoked_at, g.expires_at))
        < now() - ${retentionDays} * interval '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM operation_artifacts a
          WHERE a.tenant_id = g.tenant_id AND a.agent_id = g.agent_id AND a.grant_id = g.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM operations o
          WHERE o.tenant_id = g.tenant_id AND o.agent_id = g.agent_id
            AND o.authorized_grant_id = g.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM audit_retention_holds h
          WHERE h.tenant_id = g.tenant_id AND h.released_at IS NULL
            AND (h.agent_id IS NULL OR h.agent_id = g.agent_id)
        )
      ORDER BY g.expires_at
      LIMIT ${batchSize}
      FOR UPDATE OF g SKIP LOCKED
    )
    DELETE FROM agent_grants g USING candidates c
    WHERE g.tenant_id = c.tenant_id AND g.agent_id = c.agent_id AND g.id = c.id
    RETURNING g.id
  `);
  return removed.rows.length;
}
