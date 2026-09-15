CREATE TABLE "discovery_measurements" (
	"key" text PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"node_id" uuid,
	"campaign" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovery_measurements" ADD CONSTRAINT "discovery_measurements_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_measurement_visit" ON "discovery_measurements" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "discovery_measurement_time" ON "discovery_measurements" USING btree ("created_at");