ALTER TABLE "discovery_activities" ALTER COLUMN "owner_node_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_activities" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "discovery_activities" ADD CONSTRAINT "discovery_activities_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_activities_place_idx" ON "discovery_activities" USING btree ("place_id");