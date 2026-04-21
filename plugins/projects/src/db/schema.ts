import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const kvStore = sqliteTable("key_value_store", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  nearAccountId: text("near_account_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    organizationId: text("organization_id"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    visibility: text("visibility").notNull().default("private"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("projects_owner_slug_unique").on(table.ownerId, table.slug)],
);

export const projectApps = sqliteTable(
  "project_apps",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    gatewayId: text("gateway_id").notNull(),
    position: integer("position").notNull().default(0),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("project_app_unique").on(table.projectId, table.accountId, table.gatewayId),
  ],
);
