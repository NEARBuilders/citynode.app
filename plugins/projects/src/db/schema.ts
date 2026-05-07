import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const projects = pgTable(
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
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("projects_owner_slug_unique").on(table.ownerId, table.slug)],
);

export const projectApps = pgTable(
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
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("project_app_unique").on(table.projectId, table.accountId, table.gatewayId)],
);
