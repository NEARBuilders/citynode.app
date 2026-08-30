import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, eq, inArray, not, notLike, or } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { DatabaseTag } from "../db/layer";
import {
  domainBindings as domainBindingsTable,
  type tenantStatus,
  tenants as tenantsTable,
} from "../db/schema";
import { isUniqueViolation, toOrpcError } from "../lib/errors";

export type TenantStatus = (typeof tenantStatus)["enumValues"][number];

export interface TenantRecord {
  id: string;
  accountId: string;
  orgId: string | null;
  name: string;
  status: TenantStatus;
  allowUiOverrides: boolean;
  allowBackendOverrides: boolean;
  allowSsr: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TenantBinding {
  hostname: string;
  tenantId: string;
  accountId: string;
  allowUiOverrides: boolean;
  allowBackendOverrides: boolean;
  allowSsr: boolean;
  status: TenantStatus;
}

export interface TenantBindingRecord {
  id: string;
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  isVerified: boolean;
  verificationToken: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantInput {
  name: string;
  accountId: string;
  orgId: string | null;
  status?: TenantStatus;
  allowUiOverrides?: boolean;
  allowBackendOverrides?: boolean;
  allowSsr?: boolean;
}

export interface CreateBindingInput {
  tenantId: string;
  hostname: string;
  isPrimary?: boolean;
}

export interface TenantsService {
  listAllTenants(): Promise<TenantRecord[]>;
  listTenantsByOrgIds(orgIds: string[]): Promise<TenantRecord[]>;
  listBindings(): Promise<TenantBinding[]>;
  listBindingsForTenant(tenantId: string): Promise<TenantBindingRecord[]>;
  createBinding(input: CreateBindingInput): Promise<TenantBindingRecord>;
  verifyCustomDomain(tenantId: string, bindingId: string): Promise<TenantBindingRecord>;
  deleteBinding(tenantId: string, bindingId: string): Promise<void>;
  setPrimaryBinding(tenantId: string, bindingId: string): Promise<TenantBindingRecord>;
  resolveBindingByHostname(hostname: string): Promise<TenantBindingRecord | null>;
  createTenant(input: TenantInput): Promise<TenantRecord>;
  updateTenant(
    id: string,
    input: Partial<
      Pick<
        TenantInput,
        "name" | "accountId" | "status" | "allowUiOverrides" | "allowBackendOverrides" | "allowSsr"
      >
    >,
  ): Promise<TenantRecord>;
  softDeleteTenant(id: string): Promise<TenantRecord | null>;
  suspendTenant(id: string): Promise<TenantRecord | null>;
  reactivateTenant(id: string): Promise<TenantRecord | null>;
  resolveTenantByAccountId(accountId: string): Promise<TenantRecord | null>;
  resolveTenantById(id: string): Promise<TenantRecord | null>;
  resolveTenantByOrgId(orgId: string): Promise<TenantRecord | null>;
  deleteTenantById(id: string): Promise<boolean>;
}

export class TenantsTag extends Context.Tag("api/Tenants")<TenantsService, TenantsService>() {}

type TenantRow = typeof tenantsTable.$inferSelect;
type BindingRow = typeof domainBindingsTable.$inferSelect;

function toTenantRecord(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    orgId: row.orgId,
    name: row.name,
    status: row.status,
    allowUiOverrides: row.allowUiOverrides,
    allowBackendOverrides: row.allowBackendOverrides,
    allowSsr: row.allowSsr,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    deletedAt: row.deletedAt instanceof Date ? row.deletedAt.toISOString() : null,
  };
}

function toBindingRecord(row: BindingRow): TenantBindingRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    hostname: row.hostname,
    isPrimary: row.isPrimary,
    isVerified: row.isVerified,
    verificationToken: row.verificationToken,
    verifiedAt: row.verifiedAt instanceof Date ? row.verifiedAt.toISOString() : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function generateVerificationToken(): string {
  return randomBytes(24).toString("hex");
}

export const TenantsLive = Layer.effect(
  TenantsTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    const service: TenantsService = {
      listAllTenants: async () => {
        try {
          return (await db.select().from(tenantsTable)).map(toTenantRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      listTenantsByOrgIds: async (orgIds) => {
        if (orgIds.length === 0) return [];
        try {
          const rows = await db
            .select()
            .from(tenantsTable)
            .where(inArray(tenantsTable.orgId, orgIds));
          return rows.map(toTenantRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      listBindings: async () => {
        try {
          const rows = await db
            .select({
              hostname: domainBindingsTable.hostname,
              tenantId: domainBindingsTable.tenantId,
              accountId: tenantsTable.accountId,
              allowUiOverrides: tenantsTable.allowUiOverrides,
              allowBackendOverrides: tenantsTable.allowBackendOverrides,
              allowSsr: tenantsTable.allowSsr,
              status: tenantsTable.status,
            })
            .from(domainBindingsTable)
            .innerJoin(tenantsTable, eq(domainBindingsTable.tenantId, tenantsTable.id))
            .where(
              or(
                eq(domainBindingsTable.isVerified, true),
                notLike(domainBindingsTable.hostname, "%.%"),
              ),
            );
          return rows;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      listBindingsForTenant: async (tenantId) => {
        try {
          const rows = await db
            .select()
            .from(domainBindingsTable)
            .where(eq(domainBindingsTable.tenantId, tenantId));
          return rows.map(toBindingRecord);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      createBinding: async (input) => {
        try {
          const tenant = await db
            .select({ id: tenantsTable.id })
            .from(tenantsTable)
            .where(eq(tenantsTable.id, input.tenantId))
            .limit(1);
          if (tenant.length === 0) {
            throw new ORPCError("NOT_FOUND", {
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: input.tenantId },
            });
          }

          try {
            const [row] = await db
              .insert(domainBindingsTable)
              .values({
                tenantId: input.tenantId,
                hostname: input.hostname,
                isPrimary: input.isPrimary ?? false,
                isVerified: !input.hostname.includes("."),
                verifiedAt: input.hostname.includes(".") ? null : new Date(),
                verificationToken: generateVerificationToken(),
              })
              .returning();

            if (!row) {
              throw new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Domain binding creation failed",
              });
            }
            return toBindingRecord(row);
          } catch (error) {
            if (isUniqueViolation(error)) {
              throw new ORPCError("CONFLICT", {
                message: "Hostname already in use",
                data: { hostname: input.hostname },
              });
            }
            throw error;
          }
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      verifyCustomDomain: async (tenantId, bindingId) => {
        try {
          const [binding] = await db
            .select()
            .from(domainBindingsTable)
            .where(
              and(
                eq(domainBindingsTable.id, bindingId),
                eq(domainBindingsTable.tenantId, tenantId),
              ),
            )
            .limit(1);
          if (!binding) {
            throw new ORPCError("NOT_FOUND", {
              message: "Domain binding not found for tenant",
              data: { resource: "domainBinding", resourceId: bindingId, tenantId },
            });
          }
          if (binding.isVerified) return toBindingRecord(binding);
          if (binding.hostname.includes(".")) {
            const records = await resolveTxt(binding.hostname).catch(() => []);
            const expected = `everything-verify=${binding.verificationToken}`;
            if (!records.some((record) => record.join("") === expected)) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Verification TXT record not found. Check your DNS records and try again.",
              });
            }
          }
          const [row] = await db
            .update(domainBindingsTable)
            .set({
              isVerified: true,
              verifiedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(domainBindingsTable.id, bindingId),
                eq(domainBindingsTable.tenantId, tenantId),
              ),
            )
            .returning();

          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "Domain binding not found",
              data: { resource: "domainBinding", resourceId: bindingId },
            });
          }

          return toBindingRecord(row);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      deleteBinding: async (tenantId, bindingId) => {
        try {
          const rows = await db
            .delete(domainBindingsTable)
            .where(
              and(
                eq(domainBindingsTable.id, bindingId),
                eq(domainBindingsTable.tenantId, tenantId),
              ),
            )
            .returning({ id: domainBindingsTable.id });
          if (rows.length === 0) {
            throw new ORPCError("NOT_FOUND", {
              message: "Domain binding not found for tenant",
              data: { resource: "domainBinding", resourceId: bindingId, tenantId },
            });
          }
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      setPrimaryBinding: async (tenantId, bindingId) => {
        try {
          return await db.transaction(async (tx) => {
            const [binding] = await tx
              .select()
              .from(domainBindingsTable)
              .where(
                and(
                  eq(domainBindingsTable.id, bindingId),
                  eq(domainBindingsTable.tenantId, tenantId),
                ),
              )
              .limit(1);
            if (!binding) {
              throw new ORPCError("NOT_FOUND", {
                message: "Domain binding not found for tenant",
                data: { resource: "domainBinding", resourceId: bindingId, tenantId },
              });
            }

            await tx
              .update(domainBindingsTable)
              .set({ isPrimary: false, updatedAt: new Date() })
              .where(
                and(
                  eq(domainBindingsTable.tenantId, tenantId),
                  not(eq(domainBindingsTable.id, bindingId)),
                ),
              );

            const [updated] = await tx
              .update(domainBindingsTable)
              .set({ isPrimary: true, updatedAt: new Date() })
              .where(eq(domainBindingsTable.id, bindingId))
              .returning();

            if (!updated) {
              throw new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Failed to set primary binding",
              });
            }

            return toBindingRecord(updated);
          });
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveBindingByHostname: async (hostname) => {
        try {
          const [row] = await db
            .select()
            .from(domainBindingsTable)
            .where(eq(domainBindingsTable.hostname, hostname))
            .limit(1);
          return row ? toBindingRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      createTenant: async (input) => {
        try {
          try {
            const [row] = await db
              .insert(tenantsTable)
              .values({
                name: input.name,
                accountId: input.accountId,
                orgId: input.orgId,
                ...(input.status !== undefined && { status: input.status }),
                ...(input.allowUiOverrides !== undefined && {
                  allowUiOverrides: input.allowUiOverrides,
                }),
                ...(input.allowBackendOverrides !== undefined && {
                  allowBackendOverrides: input.allowBackendOverrides,
                }),
                ...(input.allowSsr !== undefined && { allowSsr: input.allowSsr }),
              })
              .onConflictDoNothing({ target: tenantsTable.accountId })
              .returning();

            if (!row) {
              throw new ORPCError("CONFLICT", {
                message: "Tenant with this accountId already exists",
                data: { accountId: input.accountId },
              });
            }
            return toTenantRecord(row);
          } catch (error) {
            if (error instanceof ORPCError) throw error;
            if (isUniqueViolation(error)) {
              throw new ORPCError("CONFLICT", {
                message: "Tenant with this accountId already exists",
                data: { accountId: input.accountId },
              });
            }
            throw error;
          }
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      updateTenant: async (id, input) => {
        try {
          const [row] = await db
            .update(tenantsTable)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(tenantsTable.id, id))
            .returning();

          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "Tenant not found",
              data: { resource: "tenant", resourceId: id },
            });
          }

          return toTenantRecord(row);
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      softDeleteTenant: async (id) => {
        try {
          const [row] = await db
            .update(tenantsTable)
            .set({ status: "pending_deletion", deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(tenantsTable.id, id))
            .returning();
          return row ? toTenantRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      suspendTenant: async (id) => {
        try {
          const [row] = await db
            .update(tenantsTable)
            .set({ status: "suspended", updatedAt: new Date() })
            .where(eq(tenantsTable.id, id))
            .returning();
          return row ? toTenantRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      reactivateTenant: async (id) => {
        try {
          const [row] = await db
            .update(tenantsTable)
            .set({ status: "active", updatedAt: new Date() })
            .where(eq(tenantsTable.id, id))
            .returning();
          return row ? toTenantRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveTenantByAccountId: async (accountId) => {
        try {
          const [row] = await db
            .select()
            .from(tenantsTable)
            .where(eq(tenantsTable.accountId, accountId))
            .limit(1);
          return row ? toTenantRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveTenantById: async (id) => {
        try {
          const [row] = await db
            .select()
            .from(tenantsTable)
            .where(eq(tenantsTable.id, id))
            .limit(1);
          return row ? toTenantRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      resolveTenantByOrgId: async (orgId) => {
        try {
          const [row] = await db
            .select()
            .from(tenantsTable)
            .where(eq(tenantsTable.orgId, orgId))
            .limit(1);
          return row ? toTenantRecord(row) : null;
        } catch (error) {
          throw toOrpcError(error);
        }
      },

      deleteTenantById: async (id) => {
        try {
          const rows = await db
            .delete(tenantsTable)
            .where(eq(tenantsTable.id, id))
            .returning({ deletedId: tenantsTable.id });
          return rows.length > 0;
        } catch (error) {
          throw toOrpcError(error);
        }
      },
    };

    return service;
  }),
);
