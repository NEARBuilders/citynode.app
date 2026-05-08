ALTER TABLE "project_apps" RENAME COLUMN "gateway_id" TO "domain";--> statement-breakpoint
DROP INDEX "project_app_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "project_app_unique" ON "project_apps" USING btree ("project_id","account_id","domain");--> statement-breakpoint
ALTER TABLE "project_apps" DROP COLUMN "position";