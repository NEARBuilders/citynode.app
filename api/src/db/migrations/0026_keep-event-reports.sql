ALTER TABLE "event_reports" DROP CONSTRAINT "event_reports_node_id_nodes_id_fk";
--> statement-breakpoint
DROP INDEX "discovery_manual_url";--> statement-breakpoint
ALTER TABLE "event_reports" ALTER COLUMN "node_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_reports" ADD COLUMN "removed_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_removed_tenant_id_tenants_id_fk" FOREIGN KEY ("removed_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_manual_url" ON "discovery_activities" USING btree ("canonical_url") WHERE "discovery_activities"."data"->'luma' IS NULL AND "discovery_activities"."owner_node_id" IS NOT NULL;