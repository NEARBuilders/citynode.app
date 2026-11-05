CREATE TABLE "onboarding_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"destination" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"last_visited_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "onboarding_links_organization" ON "onboarding_links" USING btree ("organization_id");