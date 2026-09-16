CREATE TABLE "discovery_luma_connections" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"calendar_name" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "discovery_luma_connections" ADD CONSTRAINT "discovery_luma_connections_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;