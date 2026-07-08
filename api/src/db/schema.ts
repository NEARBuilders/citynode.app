import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const things = pgTable("things", {
  thingId: text("thing_id").primaryKey(),
  pluginId: text("plugin_id").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
});
