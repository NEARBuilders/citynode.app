import type { ManagedAgent, ManagementSummary } from "@near-intents-agent-api/contracts";
import { countManagedResources, findManagedAgents } from "./management-repository.js";

export async function listManagedAgents(
  tenantId: string,
  after?: string,
): Promise<{ agents: ManagedAgent[]; nextCursor: string | null }> {
  const rows = await findManagedAgents(tenantId, after);
  const page = rows.slice(0, 50).map(
    (row): ManagedAgent => ({
      id: row.id,
      name: row.name,
      externalUserId: row.externalUserId,
      ownerAccountId: row.ownerAccountId,
      ownerWalletBound: row.ownerAccountId !== null,
      walletProvisioned: row.walletStatus === "active",
      policyStatus: (row.policyStatus ?? "none") as ManagedAgent["policyStatus"],
    }),
  );
  return { agents: page, nextCursor: rows.length > 50 ? (page.at(-1)?.id ?? null) : null };
}

export async function managementSummary(tenantId: string): Promise<ManagementSummary> {
  return {
    ...(await countManagedResources(tenantId)),
    observedAt: new Date().toISOString(),
    period: "all_time",
  };
}
