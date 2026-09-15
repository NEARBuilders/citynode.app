CREATE TABLE "discovery_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_node_id" uuid NOT NULL,
	"canonical_url" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "discovery_activities_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
ALTER TABLE "discovery_activities" ADD CONSTRAINT "discovery_activities_owner_node_id_nodes_id_fk" FOREIGN KEY ("owner_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;