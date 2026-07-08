DROP TABLE IF EXISTS "upvotes";
--> statement-breakpoint
CREATE TABLE "things" (
	"thing_id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
