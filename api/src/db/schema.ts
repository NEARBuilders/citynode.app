import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", [
  "active",
  "pending",
  "suspended",
  "pending_deletion",
]);

export const nodeKind = pgEnum("node_kind", ["country", "state", "city"]);

export const validatorRole = pgEnum("validator_role", ["official", "community"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: text("account_id").notNull().unique(),
  orgId: text("org_id"),
  name: text("name").notNull(),
  status: tenantStatus("status").default("active").notNull(),
  ownerKind: text("owner_kind").default("platform").notNull(),
  allowUiOverrides: boolean("allow_ui_overrides").default(true).notNull(),
  allowBackendOverrides: boolean("allow_backend_overrides").default(false).notNull(),
  allowSsr: boolean("allow_ssr").default(false).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
});

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: nodeKind("kind").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => nodes.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    parentSlugIdx: uniqueIndex("nodes_parent_slug_idx")
      .on(table.parentId, table.slug)
      .where(sql`parent_id IS NOT NULL`),
    rootSlugIdx: uniqueIndex("nodes_root_slug_idx").on(table.slug).where(sql`parent_id IS NULL`),
    parentIdx: index("nodes_parent_idx").on(table.parentId),
    tenantIdx: index("nodes_tenant_idx").on(table.tenantId),
  }),
);

export const validators = pgTable(
  "validators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    network: text("network").default("mainnet").notNull(),
    protocol: text("protocol").default("near").notNull(),
    role: validatorRole("role").default("official").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nodeIdx: index("validators_node_idx").on(table.nodeId),
    oneDefaultPerNodeIdx: uniqueIndex("validators_one_default_per_node_idx")
      .on(table.nodeId)
      .where(sql`is_default = true`),
  }),
);

export const domainBindings = pgTable(
  "domain_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    verificationToken: text("verification_token").notNull(),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index("domain_bindings_tenant_idx").on(table.tenantId),
    onePrimaryPerTenantIdx: uniqueIndex("domain_bindings_one_primary_per_tenant_idx")
      .on(table.tenantId)
      .where(sql`is_primary = true`),
  }),
);
