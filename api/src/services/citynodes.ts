import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { DatabaseTag } from "../db/layer";
import { citynodes as citynodesTable, tenants as tenantsTable } from "../db/schema";

export interface CityNodeRecord {
  id: string;
  tenantId: string;
  orgId: string;
  validatorPool: string;
  createdAt: string;
  updatedAt: string;
}

export interface CityNodeWithTenant extends CityNodeRecord {
  hostname: string;
  accountId: string;
  name: string;
  tenantStatus: string;
}

export interface CityNodeInput {
  tenantId: string;
  orgId: string;
  validatorPool: string;
}

export interface CityNodeUpdateInput {
  orgId?: string;
  validatorPool?: string;
}

export interface CityNodesService {
  list(): Promise<CityNodeWithTenant[]>;
  resolveById(id: string): Promise<CityNodeWithTenant | null>;
  resolveByTenantId(tenantId: string): Promise<CityNodeWithTenant | null>;
  resolveByAccountId(accountId: string): Promise<CityNodeWithTenant | null>;
  create(input: CityNodeInput): Promise<CityNodeWithTenant>;
  update(id: string, input: CityNodeUpdateInput): Promise<CityNodeWithTenant>;
  delete(id: string): Promise<boolean>;
}

export class CityNodesTag extends Context.Tag("api/CityNodes")<
  CityNodesService,
  CityNodesService
>() {}

type CityNodeRow = typeof citynodesTable.$inferSelect;

const TENANT_SELECT = {
  hostname: tenantsTable.subdomain,
  accountId: tenantsTable.accountId,
  name: tenantsTable.name,
  tenantStatus: tenantsTable.status,
};

function toCityNodeRecord(row: CityNodeRow): CityNodeRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orgId: row.orgId,
    validatorPool: row.validatorPool,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

type CityNodeJoinRow = CityNodeRow & {
  hostname: string;
  accountId: string;
  name: string;
  tenantStatus: string;
};

function toCityNodeWithTenant(row: CityNodeJoinRow): CityNodeWithTenant {
  return {
    ...toCityNodeRecord(row),
    hostname: row.hostname,
    accountId: row.accountId,
    name: row.name,
    tenantStatus: row.tenantStatus,
  };
}

function toOrpcError(error: unknown): ORPCError<string, unknown> {
  return error instanceof ORPCError
    ? error
    : new ORPCError("INTERNAL_SERVER_ERROR", {
        message: error instanceof Error ? error.message : String(error),
      });
}

export const CityNodesLive = Layer.effect(
  CityNodesTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const service: CityNodesService = {
      list: async () => {
        try {
          const rows = await db
            .select({ ...TENANT_SELECT, citynode: citynodesTable })
            .from(citynodesTable)
            .innerJoin(tenantsTable, eq(citynodesTable.tenantId, tenantsTable.id));
          return rows.map(({ citynode, ...tenant }) =>
            toCityNodeWithTenant({ ...citynode, ...tenant }),
          );
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveById: async (id) => {
        try {
          const rows = await db
            .select({ ...TENANT_SELECT, citynode: citynodesTable })
            .from(citynodesTable)
            .innerJoin(tenantsTable, eq(citynodesTable.tenantId, tenantsTable.id))
            .where(eq(citynodesTable.id, id))
            .limit(1);
          const row = rows[0];
          if (!row) return null;
          const { citynode, ...tenant } = row;
          return toCityNodeWithTenant({ ...citynode, ...tenant });
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveByTenantId: async (tenantId) => {
        try {
          const rows = await db
            .select({ ...TENANT_SELECT, citynode: citynodesTable })
            .from(citynodesTable)
            .innerJoin(tenantsTable, eq(citynodesTable.tenantId, tenantsTable.id))
            .where(eq(citynodesTable.tenantId, tenantId))
            .limit(1);
          const row = rows[0];
          if (!row) return null;
          const { citynode, ...tenant } = row;
          return toCityNodeWithTenant({ ...citynode, ...tenant });
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveByAccountId: async (accountId) => {
        try {
          const rows = await db
            .select({ ...TENANT_SELECT, citynode: citynodesTable })
            .from(citynodesTable)
            .innerJoin(tenantsTable, eq(citynodesTable.tenantId, tenantsTable.id))
            .where(eq(tenantsTable.accountId, accountId))
            .limit(1);
          const row = rows[0];
          if (!row) return null;
          const { citynode, ...tenant } = row;
          return toCityNodeWithTenant({ ...citynode, ...tenant });
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      create: async (input) => {
        try {
          const [row] = await db
            .insert(citynodesTable)
            .values({
              tenantId: input.tenantId,
              orgId: input.orgId,
              validatorPool: input.validatorPool,
            })
            .onConflictDoNothing()
            .returning();

          if (!row) {
            throw new ORPCError("BAD_REQUEST", {
              message: "A city node for this tenant already exists",
              data: { invalidFields: ["tenantId"] },
            });
          }

          const resolved = await service.resolveByTenantId(row.tenantId);
          if (!resolved) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: "City node created but could not be resolved",
            });
          }
          return resolved;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      update: async (id, input) => {
        try {
          const [row] = await db
            .update(citynodesTable)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(citynodesTable.id, id))
            .returning();

          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "City node not found",
              data: { resource: "citynode", resourceId: id },
            });
          }

          const resolved = await service.resolveByTenantId(row.tenantId);
          if (!resolved) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: "City node updated but could not be resolved",
            });
          }
          return resolved;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      delete: async (id) => {
        try {
          const rows = await db
            .delete(citynodesTable)
            .where(eq(citynodesTable.id, id))
            .returning({ deletedId: citynodesTable.id });
          return rows.length > 0;
        } catch (error) {
          throw toOrpcError(error);
        }
      },
    };

    return service;
  }),
);
