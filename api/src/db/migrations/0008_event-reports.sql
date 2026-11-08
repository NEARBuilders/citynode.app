CREATE TABLE "event_reports" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"node_id" uuid NOT NULL,
	"form_version" integer DEFAULT 1 NOT NULL,
	"report" jsonb NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_activity_id_discovery_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."discovery_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;