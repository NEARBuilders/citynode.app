CREATE TABLE "member_count_observations" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_directory_opt_ins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"opted_in" boolean DEFAULT false NOT NULL,
	"primary_account_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
