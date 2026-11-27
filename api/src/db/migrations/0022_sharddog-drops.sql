CREATE TABLE "sharddog_community_drops" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"drop_id" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharddog_event_drops" (
	"organization_id" text NOT NULL,
	"event_id" text NOT NULL,
	"drop_id" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sharddog_event_drops_organization_id_event_id_pk" PRIMARY KEY("organization_id","event_id")
);
